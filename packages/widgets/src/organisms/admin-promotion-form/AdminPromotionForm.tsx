import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useRef, useState } from 'react'
import type {
  IAdminPromotionFormProps,
  IBasicStyling,
  IPromoCodeDraft,
  IPromotionCatalog,
  IPromotionConditionDraft,
  IPromotionRewardDraft,
  PromotionBannerVariant,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { PromotionBannerField } from '../../molecules/promotion-banner-field'
import { RichTextEditor } from '../../molecules/rich-text-editor'
import { storeIso, storeToday, toStoreParts } from '../../utils/datetime'
import {
  MAX_PROMOTION_CONDITIONS,
  MAX_PROMOTION_REWARDS,
  buildConditions,
  buildRewards,
  conditionToDraft,
  newPromoCodeDraft,
  rewardToDraft,
} from '../../utils/promotion'
import { plainTextToHtml } from '../../utils/richText'
import { slugify } from '../../utils/slug'
import { AdminPromoCodeDialog } from '../admin-promo-code-dialog'
import { PromotionConditionBuilder } from '../promotion-condition-builder'
import { PromotionRewardBuilder } from '../promotion-reward-builder'
import * as styles from './AdminPromotionForm.css'

/**
 * Форма акции: поля, два баннера, условия и награды.
 *
 * Бэкенд принимает акцию целиком одним PUT/POST, и форма всегда держит все поля
 * сразу — списки условий и наград заменяются целиком. Числа внутри конструкторов
 * живут строками; в запрос они переводятся при отправке (`buildConditions`,
 * `buildRewards`), а ошибка у строки подсвечивается там же, где она случилась —
 * до того, как запрос уйдёт.
 *
 * Время — по магазину (Asia/Bishkek), как у сборов: владелец ставит «с 1 мая,
 * 00:00», а в ISO это переводит `storeIso`. Конец — не включительно, поэтому в
 * подсказке назван момент, а не «день». Переключатель «Бессрочная» прячет
 * конец и отправляет `endsAt: null`: акция идёт, пока её не выключат. Это явный
 * выбор, а не пустое поле: забытая дата не должна молча делать акцию вечной, а
 * стереть дату в `type="date"` на телефоне и не всегда получается.
 * В начальных значениях `endsAt: null` - бессрочная, `''` - конец надо выбрать
 * заново (так приходит «дубль» акции с датой).
 *
 * Баннеры. У сохранённой акции файл уходит на сервер сразу (`onBannerUpload`) —
 * заменённый удаляется из хранилища. При создании акции ещё нет, и файлы копятся
 * здесь и уходят вместе с сабмитом (`values.banners`) — как фото у нового товара.
 * Мобильный нужен для карусели; без него акция сохранится, но на главной
 * каталога её не будет, об этом сказано рядом с полем.
 *
 * Адрес (slug) при создании берётся из названия транслитерацией, пока владелец
 * не правил его руками; у «дубля» адрес уже занят оригиналом, поэтому страница
 * подставляет другой, а автоподстановка выключена.
 *
 * Строка-промокод в наградах настраивается в `AdminPromoCodeDialog`: он и
 * сохраняет в черновик строки, а не напрямую в акцию — применяется всё вместе по
 * «Сохранить» формы.
 */

const TITLE_MAX_LENGTH = 255
const SLUG_MAX_LENGTH = 255
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** `MAX_DESCRIPTION_HTML_LENGTH` отсекает сервер; видимый предел — как у товара. */
const DESCRIPTION_MAX_LENGTH = 2000
const SORT_ORDER_MAX = 10_000
const START_TIME = '00:00'
const END_TIME = '23:59'

interface IFields {
  title: string
  slug: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  sortOrder: string
}

const partsOf = (iso: string | null | undefined): { date: string; time: string } =>
  (iso === undefined || iso === null ? null : toStoreParts(iso)) ?? { date: '', time: '' }

const BANNER_VARIANTS: PromotionBannerVariant[] = ['mobile', 'desktop']

export const AdminPromotionForm: FC<IAdminPromotionFormProps & IBasicStyling> = ({
  catalog,
  initialValues,
  savedBanners,
  onBannerUpload,
  onBannerRemove,
  isBannerBusy = false,
  bannerError = null,
  onSubmit,
  isSubmitting = false,
  error,
  footer,
  className,
}) => {
  const isSaved = onBannerUpload !== undefined && savedBanners !== undefined
  const start = partsOf(initialValues?.startsAt)
  const end = partsOf(initialValues?.endsAt)

  const [fields, setFields] = useState<IFields>(() => ({
    title: initialValues?.title ?? '',
    slug: initialValues?.slug ?? '',
    startDate: start.date === '' ? storeToday().date : start.date,
    startTime: start.date === '' ? START_TIME : start.time,
    endDate: end.date,
    endTime: end.date === '' ? END_TIME : end.time,
    sortOrder: String(initialValues?.sortOrder ?? 0),
  }))
  const [isSlugTouched, setIsSlugTouched] = useState(initialValues !== undefined)
  const [descriptionHtml, setDescriptionHtml] = useState(
    () => initialValues?.descriptionHtml ?? plainTextToHtml('')
  )
  const [isEnabled, setIsEnabled] = useState(initialValues?.isEnabled ?? true)
  const [announce, setAnnounce] = useState(initialValues?.announce ?? false)
  const [isOpenEnded, setIsOpenEnded] = useState(initialValues?.endsAt === null)
  const [conditions, setConditions] = useState<IPromotionConditionDraft[]>(
    () => initialValues?.conditions.map(conditionToDraft) ?? []
  )
  const [rewards, setRewards] = useState<IPromotionRewardDraft[]>(
    () => initialValues?.rewards.map(rewardToDraft) ?? []
  )
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [codeKey, setCodeKey] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Названия товаров, выбранных в этой форме: страница знает только те, что пришли с сервером.
  const [labels, setLabels] = useState<Record<string, string>>(catalog.labels)

  // Выбранные при создании баннеры и их blob-адреса для превью.
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

  // Страница дочитывает названия после загрузки акции — подмешиваем, не теряя выбранные здесь.
  useEffect(() => {
    setLabels(current => ({ ...catalog.labels, ...current }))
  }, [catalog.labels])

  const scopedCatalog: IPromotionCatalog = {
    ...catalog,
    labels,
    onLabel: (id, label) => {
      setLabels(current => (current[id] === label ? current : { ...current, [id]: label }))
      catalog.onLabel(id, label)
    },
  }

  const patch = (next: Partial<IFields>): void => {
    setFields(current => ({ ...current, ...next }))
  }

  const startIso = storeIso(fields.startDate, fields.startTime)
  const endIso = fields.endDate === '' ? '' : storeIso(fields.endDate, fields.endTime)
  const builtConditions = buildConditions(conditions)
  const builtRewards = buildRewards(rewards)
  const sortOrder = fields.sortOrder === '' ? 0 : Number(fields.sortOrder)

  const errors = {
    title: fields.title.trim() === '' ? 'Введите название акции' : null,
    slug:
      fields.slug.trim() === ''
        ? 'Введите адрес'
        : SLUG_PATTERN.test(fields.slug.trim())
          ? null
          : 'Только латиница, цифры и дефисы: spring-sale',
    start: startIso === '' ? 'Укажите дату и время начала' : null,
    end: isOpenEnded
      ? null
      : endIso === ''
        ? 'Укажите дату и время окончания'
        : startIso !== '' && endIso <= startIso
          ? 'Акция должна заканчиваться позже, чем начинается'
          : null,
    sortOrder:
      Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder <= SORT_ORDER_MAX
        ? null
        : `Порядок - число от 0 до ${SORT_ORDER_MAX}`,
    rewards: rewards.length === 0 ? 'Добавьте хотя бы одну награду' : null,
  }

  const hasErrors =
    Object.values(errors).some(message => message !== null) ||
    Object.keys(builtConditions.errors).length > 0 ||
    Object.keys(builtRewards.errors).length > 0

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (hasErrors) {
      // Первая подсветка — наверх формы не прыгаем: ошибка стоит у самого поля, браузер ведёт к нему.
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()

      return
    }

    onSubmit({
      title: fields.title.trim(),
      slug: fields.slug.trim(),
      descriptionHtml,
      startsAt: startIso,
      endsAt: isOpenEnded ? null : endIso,
      isEnabled,
      announce,
      sortOrder,
      conditions: builtConditions.value,
      rewards: builtRewards.value,
      banners: pending,
    })
  }

  const selectBanner = (variant: PromotionBannerVariant, file: File): void => {
    if (isSaved) {
      onBannerUpload(variant, file)

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

  const removeBanner = (variant: PromotionBannerVariant): void => {
    if (isSaved) {
      onBannerRemove?.(variant)

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

  const bannerUrl = (variant: PromotionBannerVariant): string | null =>
    isSaved ? savedBanners[variant] : previews[variant]

  const codeRow = rewards.find(row => row.key === codeKey)

  return (
    <form
      ref={formRef}
      className={clsx(styles.container, className)}
      noValidate={true}
      onSubmit={handleSubmit}
    >
      <section className={styles.panel} aria-labelledby="promotion-main">
        <h2 className={styles.sectionTitle} id="promotion-main">
          Основное
        </h2>

        <Input
          label="Название"
          value={fields.title}
          maxLength={TITLE_MAX_LENGTH}
          required={true}
          error={isSubmitted ? errors.title : null}
          onChange={next => {
            patch({ title: next, ...(isSlugTouched ? {} : { slug: slugify(next) }) })
          }}
        />

        <Input
          label="Адрес (slug)"
          value={fields.slug}
          maxLength={SLUG_MAX_LENGTH}
          required={true}
          hint={`Страница акции: /promotions/${fields.slug.trim() === '' ? 'spring-sale' : fields.slug.trim()}`}
          error={isSubmitted ? errors.slug : null}
          onChange={next => {
            setIsSlugTouched(true)
            patch({ slug: next })
          }}
        />

        <RichTextEditor
          label="Описание"
          value={descriptionHtml}
          maxLength={DESCRIPTION_MAX_LENGTH}
          hint="Показывается на странице акции"
          onChange={setDescriptionHtml}
        />

        <div className={styles.pair}>
          <Input
            label="Начало, дата"
            type="date"
            value={fields.startDate}
            required={true}
            error={isSubmitted ? errors.start : null}
            onChange={next => {
              patch({ startDate: next })
            }}
          />
          <Input
            label="Начало, время"
            type="time"
            value={fields.startTime}
            required={true}
            onChange={next => {
              patch({ startTime: next })
            }}
          />
        </div>

        <Switch
          label="Бессрочная - без даты окончания"
          checked={isOpenEnded}
          onChange={setIsOpenEnded}
        />

        {!isOpenEnded && (
          <div className={styles.pair}>
            <Input
              label="Конец, дата"
              type="date"
              value={fields.endDate}
              required={true}
              error={isSubmitted ? errors.end : null}
              onChange={next => {
                patch({ endDate: next })
              }}
            />
            <Input
              label="Конец, время"
              type="time"
              value={fields.endTime}
              hint="Время по Бишкеку. Акция действует до этого момента, не включая его."
              required={true}
              onChange={next => {
                patch({ endTime: next })
              }}
            />
          </div>
        )}

        <Input
          label="Порядок"
          value={fields.sortOrder}
          inputMode="numeric"
          maxLength={String(SORT_ORDER_MAX).length}
          hint="Меньше - раньше: в карусели и при подсчёте скидок. Скидки акций идут от остатка друг друга по этому порядку."
          error={isSubmitted ? errors.sortOrder : null}
          onChange={next => {
            patch({ sortOrder: next.replace(/\D/g, '') })
          }}
        />

        <div className={styles.switches}>
          <Switch label="Акция включена" checked={isEnabled} onChange={setIsEnabled} />

          <Switch
            label="Объявить всем в Telegram при старте"
            checked={announce}
            onChange={setAnnounce}
          />
          <Text tone="secondary" size="sm">
            Рассылка уходит всем покупателям с привязанным ботом, один раз - когда акция начнётся.
          </Text>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="promotion-banners">
        <h2 className={styles.sectionTitle} id="promotion-banners">
          Баннеры
        </h2>

        <Text tone="secondary" size="sm">
          Баннер встаёт в карусель вверху каталога - один слайд на всю ширину. Мобильный нужен
          обязательно: без него акции в карусели не будет. Десктопный необязателен - без него на
          широком экране растянется мобильный.
          {isSaved ? ' Файл сохраняется сразу.' : ' Файлы загрузятся вместе с акцией.'}
        </Text>

        <div className={styles.banners}>
          {BANNER_VARIANTS.map(variant => (
            <PromotionBannerField
              key={variant}
              variant={variant}
              url={bannerUrl(variant)}
              isRequired={variant === 'mobile'}
              isBusy={isBannerBusy || isSubmitting}
              error={bannerError}
              onSelect={file => {
                selectBanner(variant, file)
              }}
              onRemove={() => {
                removeBanner(variant)
              }}
            />
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="promotion-conditions">
        <h2 className={styles.sectionTitle} id="promotion-conditions">
          Условия
        </h2>

        <Text tone="secondary" size="sm">
          Чтобы получить награды, заявка должна выполнять все условия сразу. Сумма и количество
          считаются до скидок, подарки не в счёт.
        </Text>

        <PromotionConditionBuilder
          value={conditions}
          onChange={setConditions}
          catalog={scopedCatalog}
          errors={isSubmitted ? builtConditions.errors : {}}
          maxRows={MAX_PROMOTION_CONDITIONS}
        />
      </section>

      <section className={styles.panel} aria-labelledby="promotion-rewards">
        <h2 className={styles.sectionTitle} id="promotion-rewards">
          Награды
        </h2>

        <PromotionRewardBuilder
          value={rewards}
          onChange={setRewards}
          catalog={scopedCatalog}
          errors={isSubmitted ? builtRewards.errors : {}}
          maxRows={MAX_PROMOTION_REWARDS}
          onEditPromoCode={setCodeKey}
        />

        {isSubmitted && errors.rewards !== null && (
          <Text size="sm" tone="danger">
            {errors.rewards}
          </Text>
        )}
      </section>

      {/*
        Ошибка сервера — у кнопки, а не над формой: на телефоне верх формы в этот
        момент за краем экрана.
      */}
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
          {isSaved ? 'Сохранить' : 'Создать акцию'}
        </Button>
        {footer}
      </div>

      {codeRow !== undefined && (
        <AdminPromoCodeDialog
          isOpen={true}
          value={codeRow.promoCode ?? newPromoCodeDraft()}
          catalog={scopedCatalog}
          onClose={() => {
            setCodeKey(null)
          }}
          onSave={(draft: IPromoCodeDraft) => {
            setRewards(current =>
              current.map(row => (row.key === codeRow.key ? { ...row, promoCode: draft } : row))
            )
            setCodeKey(null)
          }}
        />
      )}
    </form>
  )
}
