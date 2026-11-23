import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useRef, useState } from 'react'
import type {
  IAdminNewsBannerFormProps,
  IBannerSlide,
  IBasicStyling,
  PromotionBannerVariant,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { FormSection } from '../../molecules/form-section'
import { PromotionBannerField } from '../../molecules/promotion-banner-field'
import { PromotionPeriodFields } from '../../molecules/promotion-period-fields'
import {
  NEWS_CTA_MAX,
  NEWS_LINK_MAX,
  NEWS_TEXT_MAX,
  NEWS_TITLE_MAX,
  isExternalBannerLink,
  isValidBannerLink,
} from '../../utils/banner'
import { storeIso, storeToday, toStoreParts } from '../../utils/datetime'
import { PromoCarousel } from '../promo-carousel'
import * as styles from './AdminNewsBannerForm.css'

/**
 * Форма своей новости для карусели: текст, ссылка, период показа, картинки.
 *
 * Бэкенд принимает новость целиком одним PUT/POST, картинки - отдельными файлами,
 * как баннеры акции: у сохранённой новости файл уходит сразу (`onImageUpload`),
 * при создании копится здесь и уходит вместе с сабмитом (`values.images`).
 * Картинка необязательна: без мобильной новость показывается текстовым слайдом.
 *
 * Время - по магазину (Asia/Bishkek). Начало необязательно: «Показывать сразу»
 * прячет его и отправляет `startsAt: null`; «Без даты окончания» делает то же с
 * концом. Конец не включительно, поэтому в подсказке назван момент.
 *
 * Проверки повторяют бэкенд (`app/banners`): заголовок обязателен, ссылка - путь
 * на сайте или `https://`, конец позже начала. Ошибка показывается после первой
 * попытки отправить, как в форме акции.
 *
 * Предпросмотр - тот же `PromoCarousel` с одним слайдом из черновика, поэтому
 * владелец видит именно то, что увидит покупатель, включая обрезку текста и
 * кадрирование картинки. Он не кликабелен (`inert`): ссылка слайда не должна
 * уводить со страницы с несохранёнными правками.
 */

const START_TIME = '00:00'
const END_TIME = '23:59'
const PREVIEW_TITLE = 'Заголовок новости'

interface IFields {
  title: string
  text: string
  linkUrl: string
  ctaLabel: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

type SectionKey = 'main' | 'period' | 'images' | 'preview'

const VARIANTS: PromotionBannerVariant[] = ['mobile', 'desktop']

const partsOf = (iso: string | null | undefined): { date: string; time: string } =>
  (iso === undefined || iso === null ? null : toStoreParts(iso)) ?? { date: '', time: '' }

export const AdminNewsBannerForm: FC<IAdminNewsBannerFormProps & IBasicStyling> = ({
  initialValues,
  savedImages,
  onImageUpload,
  onImageRemove,
  isImageBusy = false,
  imageError = null,
  onSubmit,
  isSubmitting = false,
  error,
  footer,
  className,
}) => {
  const isSaved = onImageUpload !== undefined && savedImages !== undefined
  const start = partsOf(initialValues?.startsAt)
  const end = partsOf(initialValues?.endsAt)

  const [fields, setFields] = useState<IFields>(() => ({
    title: initialValues?.title ?? '',
    text: initialValues?.text ?? '',
    linkUrl: initialValues?.linkUrl ?? '',
    ctaLabel: initialValues?.ctaLabel ?? '',
    startDate: start.date === '' ? storeToday().date : start.date,
    startTime: start.date === '' ? START_TIME : start.time,
    endDate: end.date,
    endTime: end.date === '' ? END_TIME : end.time,
  }))
  const [isStartNow, setIsStartNow] = useState(initialValues?.startsAt == null)
  const [isOpenEnded, setIsOpenEnded] = useState(initialValues?.endsAt == null)
  const [isEnabled, setIsEnabled] = useState(initialValues?.isEnabled ?? true)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    main: true,
    period: true,
    images: true,
    preview: true,
  })
  // Растёт с каждой неудачной отправкой: фокус ставится после того, как раскрылись секции с ошибками.
  const [focusRequest, setFocusRequest] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  // Выбранные при создании файлы и их blob-адреса для превью.
  const [pending, setPending] = useState<Record<PromotionBannerVariant, File | null>>({
    mobile: null,
    desktop: null,
  })
  const [previews, setPreviews] = useState<Record<PromotionBannerVariant, string | null>>({
    mobile: null,
    desktop: null,
  })
  const previewUrls = useRef(new Set<string>())

  useEffect(() => {
    const urls = previewUrls.current

    return () => {
      urls.forEach(url => {
        URL.revokeObjectURL(url)
      })
    }
  }, [])

  useEffect(() => {
    if (focusRequest > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }, [focusRequest])

  const patch = (next: Partial<IFields>): void => {
    setFields(current => ({ ...current, ...next }))
  }

  const title = fields.title.trim()
  const text = fields.text.trim()
  const linkUrl = fields.linkUrl.trim()
  const ctaLabel = fields.ctaLabel.trim()
  const startIso = storeIso(fields.startDate, fields.startTime)
  const endIso = fields.endDate === '' ? '' : storeIso(fields.endDate, fields.endTime)

  const errors = {
    title: title === '' ? 'Введите заголовок' : null,
    link:
      linkUrl === '' || isValidBannerLink(linkUrl)
        ? null
        : 'Ссылка должна начинаться с / или https://',
    start: !isStartNow && startIso === '' ? 'Укажите дату и время начала' : null,
    end: isOpenEnded
      ? null
      : endIso === ''
        ? 'Укажите дату и время окончания'
        : !isStartNow && startIso !== '' && endIso <= startIso
          ? 'Конец показа должен быть позже начала'
          : null,
  }

  const sectionErrors: Record<SectionKey, boolean> = {
    main: errors.title !== null || errors.link !== null,
    period: errors.start !== null || errors.end !== null,
    images: false,
    preview: false,
  }
  const hasErrors = Object.values(sectionErrors).some(Boolean)

  const imageUrl = (variant: PromotionBannerVariant): string | null =>
    isSaved ? savedImages[variant] : previews[variant]

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (hasErrors) {
      setOpenSections(current => ({
        main: current.main || sectionErrors.main,
        period: current.period || sectionErrors.period,
        images: current.images,
        preview: current.preview,
      }))
      setFocusRequest(current => current + 1)

      return
    }

    onSubmit({
      title,
      text: text === '' ? null : text,
      linkUrl: linkUrl === '' ? null : linkUrl,
      ctaLabel: ctaLabel === '' ? null : ctaLabel,
      startsAt: isStartNow ? null : startIso,
      endsAt: isOpenEnded ? null : endIso,
      isEnabled,
      images: pending,
    })
  }

  const selectImage = (variant: PromotionBannerVariant, file: File): void => {
    if (isSaved) {
      onImageUpload(variant, file)

      return
    }

    const url = URL.createObjectURL(file)

    previewUrls.current.add(url)
    setPending(current => ({ ...current, [variant]: file }))
    setPreviews(current => {
      const previous = current[variant]

      if (previous !== null) {
        URL.revokeObjectURL(previous)
        previewUrls.current.delete(previous)
      }

      return { ...current, [variant]: url }
    })
  }

  const removeImage = (variant: PromotionBannerVariant): void => {
    if (isSaved) {
      onImageRemove?.(variant)

      return
    }

    setPending(current => ({ ...current, [variant]: null }))
    setPreviews(current => {
      const previous = current[variant]

      if (previous !== null) {
        URL.revokeObjectURL(previous)
        previewUrls.current.delete(previous)
      }

      return { ...current, [variant]: null }
    })
  }

  const toggleSection = (key: SectionKey): void => {
    setOpenSections(current => ({ ...current, [key]: !current[key] }))
  }

  const hasLink = linkUrl !== '' && errors.link === null
  const previewSlide: IBannerSlide = {
    key: 'news:draft',
    kind: 'NEWS',
    title: title === '' ? PREVIEW_TITLE : title,
    text: text === '' ? null : text,
    imageMobileUrl: imageUrl('mobile'),
    imageDesktopUrl: imageUrl('desktop'),
    href: hasLink ? linkUrl : null,
    isExternal: hasLink && isExternalBannerLink(linkUrl),
    ctaLabel: ctaLabel === '' ? null : ctaLabel,
  }

  const imageCount = VARIANTS.filter(variant => imageUrl(variant) !== null).length
  const imageSummary =
    imageCount === 0
      ? 'Без картинки - текстовый слайд'
      : imageCount === VARIANTS.length
        ? 'Обе загружены'
        : imageUrl('mobile') === null
          ? 'Только десктопная'
          : 'Только мобильная'

  return (
    <form
      ref={formRef}
      className={clsx(styles.container, className)}
      noValidate={true}
      onSubmit={handleSubmit}
    >
      <FormSection
        title="Основное"
        summary={openSections.main || title === '' ? undefined : title}
        isOpen={openSections.main}
        onToggle={() => {
          toggleSection('main')
        }}
      >
        <Input
          label="Заголовок"
          value={fields.title}
          maxLength={NEWS_TITLE_MAX}
          required={true}
          hint="Заголовок текстового слайда; у слайда с картинкой - её описание"
          error={isSubmitted ? errors.title : null}
          onChange={next => {
            patch({ title: next })
          }}
        />

        <Textarea
          label="Текст"
          value={fields.text}
          maxLength={NEWS_TEXT_MAX}
          rows={3}
          hint="Показывается на текстовом слайде, до трёх строк на телефоне, до двух на десктопе"
          onChange={next => {
            patch({ text: next })
          }}
        />

        <Input
          label="Ссылка"
          value={fields.linkUrl}
          maxLength={NEWS_LINK_MAX}
          inputMode="url"
          autoComplete="off"
          hint="Путь на сайте (/catalog) или адрес с https://. Без ссылки слайд не нажимается"
          error={isSubmitted ? errors.link : null}
          onChange={next => {
            patch({ linkUrl: next })
          }}
        />

        <Input
          label="Подпись кнопки"
          value={fields.ctaLabel}
          maxLength={NEWS_CTA_MAX}
          hint="У текстового слайда со ссылкой. Если пусто - «Подробнее»"
          onChange={next => {
            patch({ ctaLabel: next })
          }}
        />

        <div className={styles.switches}>
          <Switch label="Новость включена" checked={isEnabled} onChange={setIsEnabled} />
        </div>
      </FormSection>

      <FormSection
        title="Период показа"
        summary={isStartNow && isOpenEnded ? 'Сразу, без даты окончания' : undefined}
        isOpen={openSections.period}
        onToggle={() => {
          toggleSection('period')
        }}
      >
        <Switch label="Показывать сразу" checked={isStartNow} onChange={setIsStartNow} />

        <PromotionPeriodFields
          startDate={fields.startDate}
          startTime={fields.startTime}
          endDate={fields.endDate}
          endTime={fields.endTime}
          isOpenEnded={isOpenEnded}
          hideStart={isStartNow}
          openEndedLabel="Без даты окончания"
          endHint="Время по Бишкеку. Новость показывается до этого момента, не включая его."
          errors={{
            start: isSubmitted ? errors.start : null,
            end: isSubmitted ? errors.end : null,
          }}
          onChange={patch}
          onOpenEndedChange={setIsOpenEnded}
        />
      </FormSection>

      <FormSection
        title="Картинки"
        summary={imageSummary}
        isOpen={openSections.images}
        onToggle={() => {
          toggleSection('images')
        }}
      >
        <Text tone="secondary" size="sm">
          Картинка необязательна: без мобильной новость показывается текстовым слайдом. Десктопная
          необязательна - без неё на широком экране растянется мобильная.
          {isSaved ? ' Файл сохраняется сразу.' : ' Файлы загрузятся вместе с новостью.'}
        </Text>

        <div className={styles.images}>
          {VARIANTS.map(variant => (
            <PromotionBannerField
              key={variant}
              variant={variant}
              url={imageUrl(variant)}
              isBusy={isImageBusy || isSubmitting}
              error={imageError}
              onSelect={file => {
                selectImage(variant, file)
              }}
              onRemove={() => {
                removeImage(variant)
              }}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Предпросмотр"
        summary="Так слайд увидит покупатель"
        isOpen={openSections.preview}
        onToggle={() => {
          toggleSection('preview')
        }}
      >
        <div className={styles.preview} inert={true} data-testid="news-preview">
          <PromoCarousel slides={[previewSlide]} />
        </div>
      </FormSection>

      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не получилось сохранить">
          {error}
        </Alert>
      )}

      {isSubmitted && hasErrors && (
        <Alert tone="warning" title="Проверьте форму">
          Некоторые поля заполнены неверно - они отмечены выше.
        </Alert>
      )}

      <div className={styles.actions}>
        <Button isFullWidth="mobile" type="submit" isLoading={isSubmitting}>
          {isSaved ? 'Сохранить' : 'Создать новость'}
        </Button>
        {footer}
      </div>
    </form>
  )
}
