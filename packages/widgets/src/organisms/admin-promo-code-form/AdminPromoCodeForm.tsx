import clsx from 'clsx'
import { type FC, type FormEvent, useEffect, useRef, useState } from 'react'
import type {
  IAdminPromoCodeFormProps,
  IBasicStyling,
  ICustomerOption,
  IPromotionCatalog,
  IPromotionCodeReward,
  IPromotionConditionDraft,
  IPromotionRewardDraft,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { CustomerSelect } from '../../molecules/customer-select'
import { FormSection } from '../../molecules/form-section'
import { PromotionPeriodFields } from '../../molecules/promotion-period-fields'
import { RichTextEditor } from '../../molecules/rich-text-editor'
import { storeIso, storeToday, toStoreParts } from '../../utils/datetime'
import {
  MAX_PROMOTION_CONDITIONS,
  MAX_PROMOTION_REWARDS,
  buildConditions,
  buildRewards,
  conditionToDraft,
  rewardToDraft,
} from '../../utils/promotion'
import { pluralize } from '../../utils/plural'
import { plainTextToHtml } from '../../utils/richText'
import { PromotionConditionBuilder } from '../promotion-condition-builder'
import { PromotionRewardBuilder } from '../promotion-reward-builder'
import * as styles from './AdminPromoCodeForm.css'

/**
 * Форма промокода владельца: код, название, окно действия, «кому», условия и награды.
 *
 * Условия и награды те же, что у акции (`PromotionConditionBuilder`,
 * `PromotionRewardBuilder`), с одним отличием: наградой кода не может быть другой
 * промокод (`allowPromoCode={false}`). Окно действия - `PromotionPeriodFields`,
 * время по магазину (Asia/Bishkek); «Бессрочный» уводит `endsAt: null`.
 *
 * Код. При создании по умолчанию генерируется на сервере (`code: null`), а если
 * владелец хочет свой - набирает его, и форма приводит набранное к виду, в каком
 * код хранится: заглавные латинские буквы и цифры, пробелы и дефисы убраны (так же
 * делает сервер, `normalize_code`). Кириллица отсекается сразу: на телефоне
 * покупатель набирает код латиницей, и русская «С» вместо латинской «C» - частая
 * ошибка. У сохранённого кода его можно заменить новым («Сгенерировать новый»);
 * тогда на сервер уходит `code: null`, а не прежняя строка.
 *
 * «Кому». Общий код может применить любой покупатель, каждый раз по разу.
 * Персональный привязан к одному аккаунту, которого владелец находит поиском:
 * сам поиск ведёт страница (`customerSelect`), а выбранный покупатель - состояние
 * формы. Выбор покупателя без включённого «Персональный» не уходит.
 *
 * Четыре секции сворачиваются так же, как у формы акции (`FormSection`): открыта
 * только «Основное», у остальных в заголовке сводка. При ошибке форма раскрывает
 * секцию и ставит фокус на первое неверное поле.
 */

const TITLE_MAX_LENGTH = 255
/** Набранное с пробелами и дефисами длиннее самого кода: сервер их убирает, форма тоже. */
const CODE_INPUT_MAX_LENGTH = 24
const CODE_PATTERN = /^[A-Z0-9]{4,16}$/
/** `MAX_DESCRIPTION_HTML_LENGTH` отсекает сервер; видимый предел - как у акции. */
const DESCRIPTION_MAX_LENGTH = 2000
const START_TIME = '00:00'
const END_TIME = '23:59'

/** Код в том виде, в каком его хранит сервер: без пробелов и дефисов, заглавными. */
const normalizeCode = (raw: string): string => raw.toUpperCase().replace(/[\s-]/g, '')

const partsOf = (iso: string | null | undefined): { date: string; time: string } =>
  (iso === undefined || iso === null ? null : toStoreParts(iso)) ?? { date: '', time: '' }

const isCodeReward = (
  reward: ReturnType<typeof buildRewards>['value'][number]
): reward is IPromotionCodeReward => reward.type !== 'PROMO_CODE'

interface IFields {
  title: string
  code: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

type SectionKey = 'main' | 'whom' | 'conditions' | 'rewards'

const INITIAL_OPEN: Record<SectionKey, boolean> = {
  main: true,
  whom: false,
  conditions: false,
  rewards: false,
}

export const AdminPromoCodeForm: FC<IAdminPromoCodeFormProps & IBasicStyling> = ({
  catalog,
  customerSelect,
  initialValues,
  isSaved = false,
  onSubmit,
  isSubmitting = false,
  error,
  footer,
  className,
}) => {
  const start = partsOf(initialValues?.startsAt)
  const end = partsOf(initialValues?.endsAt)
  const savedCode = initialValues?.code ?? null

  const [fields, setFields] = useState<IFields>(() => ({
    title: initialValues?.title ?? '',
    code: savedCode ?? '',
    startDate: start.date === '' ? storeToday().date : start.date,
    startTime: start.date === '' ? START_TIME : start.time,
    endDate: end.date,
    endTime: end.date === '' ? END_TIME : end.time,
  }))
  // Создание и дубль начинаются с «сгенерировать»; сохранённый код - с его строки в поле.
  const [isAutoCode, setIsAutoCode] = useState(savedCode === null)
  const [descriptionHtml, setDescriptionHtml] = useState(
    () => initialValues?.descriptionHtml ?? plainTextToHtml('')
  )
  const [isEnabled, setIsEnabled] = useState(initialValues?.isEnabled ?? true)
  const [isOpenEnded, setIsOpenEnded] = useState(
    initialValues === undefined || initialValues.endsAt === null
  )
  const [isPersonal, setIsPersonal] = useState((initialValues?.assignedUser ?? null) !== null)
  const [assignedUser, setAssignedUser] = useState<ICustomerOption | null>(
    initialValues?.assignedUser ?? null
  )
  const [conditions, setConditions] = useState<IPromotionConditionDraft[]>(
    () => initialValues?.conditions.map(conditionToDraft) ?? []
  )
  const [rewards, setRewards] = useState<IPromotionRewardDraft[]>(
    () => initialValues?.rewards.map(rewardToDraft) ?? []
  )
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [openSections, setOpenSections] = useState(INITIAL_OPEN)
  // Растёт с каждой неудачной отправкой: фокус ставится после того, как раскрылись секции с ошибками.
  const [focusRequest, setFocusRequest] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  // Названия товаров, выбранных в этой форме: страница знает только те, что пришли с сервером.
  const [labels, setLabels] = useState<Record<string, string>>(catalog.labels)

  useEffect(() => {
    if (focusRequest > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }, [focusRequest])

  // Страница дочитывает названия после загрузки кода - подмешиваем, не теряя выбранные здесь.
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
  const normalizedCode = normalizeCode(fields.code)

  const errors = {
    code: isAutoCode
      ? null
      : CODE_PATTERN.test(normalizedCode)
        ? null
        : 'Код - от 4 до 16 латинских букв и цифр, без пробелов',
    title: fields.title.trim() === '' ? 'Введите название промокода' : null,
    start: startIso === '' ? 'Укажите дату и время начала' : null,
    end: isOpenEnded
      ? null
      : endIso === ''
        ? 'Укажите дату и время окончания'
        : startIso !== '' && endIso <= startIso
          ? 'Промокод должен заканчиваться позже, чем начинается'
          : null,
    customer: isPersonal && assignedUser === null ? 'Выберите покупателя' : null,
    rewards: rewards.length === 0 ? 'Добавьте хотя бы одну награду' : null,
  }

  const sectionErrors: Record<SectionKey, boolean> = {
    main: [errors.code, errors.title, errors.start, errors.end].some(message => message !== null),
    whom: errors.customer !== null,
    conditions: Object.keys(builtConditions.errors).length > 0,
    rewards: errors.rewards !== null || Object.keys(builtRewards.errors).length > 0,
  }

  const hasErrors = Object.values(sectionErrors).some(Boolean)

  const toggleSection = (key: SectionKey): void => {
    setOpenSections(current => ({ ...current, [key]: !current[key] }))
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setIsSubmitted(true)

    if (hasErrors) {
      // Наверх формы не прыгаем: ошибка стоит у самого поля, фокус ведёт к нему. Свёрнутые
      // секции с ошибками раскрываются, иначе фокусировать было бы нечего.
      setOpenSections(current => ({
        main: current.main || sectionErrors.main,
        whom: current.whom || sectionErrors.whom,
        conditions: current.conditions || sectionErrors.conditions,
        rewards: current.rewards || sectionErrors.rewards,
      }))
      setFocusRequest(current => current + 1)

      return
    }

    onSubmit({
      code: isAutoCode ? null : normalizedCode,
      title: fields.title.trim(),
      descriptionHtml,
      startsAt: startIso,
      endsAt: isOpenEnded ? null : endIso,
      isEnabled,
      assignedUser: isPersonal ? assignedUser : null,
      conditions: builtConditions.value,
      rewards: builtRewards.value.filter(isCodeReward),
    })
  }

  const conditionSummary =
    conditions.length === 0
      ? 'Без условий'
      : pluralize(conditions.length, ['условие', 'условия', 'условий'])
  const rewardSummary =
    rewards.length === 0
      ? 'Не добавлены'
      : pluralize(rewards.length, ['награда', 'награды', 'наград'])
  const mainSummary = isAutoCode
    ? fields.title.trim()
    : [normalizedCode, fields.title.trim()].filter(part => part !== '').join(' - ')

  return (
    <form
      ref={formRef}
      className={clsx(styles.container, className)}
      noValidate={true}
      onSubmit={handleSubmit}
    >
      <FormSection
        title="Основное"
        summary={openSections.main || mainSummary === '' ? undefined : mainSummary}
        isOpen={openSections.main}
        onToggle={() => {
          toggleSection('main')
        }}
      >
        {!isSaved && (
          <Switch
            label="Сгенерировать код автоматически"
            checked={isAutoCode}
            onChange={setIsAutoCode}
          />
        )}

        {isAutoCode ? (
          <div className={styles.codeRow}>
            <Text tone="secondary" size="sm" className={styles.codeInput}>
              {isSaved
                ? 'Новый код появится после сохранения, прежний перестанет работать.'
                : 'Код из 8 символов появится после сохранения.'}
            </Text>
            {isSaved && savedCode !== null && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsAutoCode(false)
                  patch({ code: savedCode })
                }}
              >
                Оставить прежний
              </Button>
            )}
          </div>
        ) : (
          <div className={styles.codeRow}>
            <Input
              className={styles.codeInput}
              label="Код"
              value={fields.code}
              maxLength={CODE_INPUT_MAX_LENGTH}
              required={true}
              hint="Латинские буквы и цифры, 4-16 символов. Пробелы и дефисы убираются."
              error={isSubmitted ? errors.code : null}
              onChange={next => {
                patch({ code: next.toUpperCase() })
              }}
            />
            {isSaved && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsAutoCode(true)
                }}
              >
                Сгенерировать новый
              </Button>
            )}
          </div>
        )}

        <Input
          label="Название"
          value={fields.title}
          maxLength={TITLE_MAX_LENGTH}
          required={true}
          hint="Видно владельцу в списке; покупатель увидит его, если код персональный."
          error={isSubmitted ? errors.title : null}
          onChange={next => {
            patch({ title: next })
          }}
        />

        <RichTextEditor
          label="Описание"
          value={descriptionHtml}
          maxLength={DESCRIPTION_MAX_LENGTH}
          hint="Видно покупателю, если код персональный - на странице «Промокоды»"
          onChange={setDescriptionHtml}
        />

        <PromotionPeriodFields
          startDate={fields.startDate}
          startTime={fields.startTime}
          endDate={fields.endDate}
          endTime={fields.endTime}
          isOpenEnded={isOpenEnded}
          errors={{
            start: isSubmitted ? errors.start : null,
            end: isSubmitted ? errors.end : null,
          }}
          onChange={patch}
          onOpenEndedChange={setIsOpenEnded}
          openEndedLabel="Бессрочный - без даты окончания"
          endHint="Время по Бишкеку. Промокод действует до этого момента, не включая его."
        />

        <div className={styles.switches}>
          <Switch label="Промокод включён" checked={isEnabled} onChange={setIsEnabled} />
        </div>
      </FormSection>

      <FormSection
        title="Кому"
        summary={isPersonal ? (assignedUser?.name ?? 'Покупатель не выбран') : 'Всем'}
        isOpen={openSections.whom}
        onToggle={() => {
          toggleSection('whom')
        }}
      >
        <Text tone="secondary" size="sm">
          Общий код может применить любой покупатель, каждый - один раз. Персональный - только
          выбранный, один раз.
        </Text>

        <Switch
          label="Персональный - только для одного покупателя"
          checked={isPersonal}
          onChange={setIsPersonal}
        />

        {isPersonal && (
          <CustomerSelect {...customerSelect} value={assignedUser} onChange={setAssignedUser} />
        )}

        {/* Ошибка проверки - у поля, а не вместо выдачи: поиск покупателя должен работать. */}
        {isPersonal && isSubmitted && errors.customer !== null && (
          <Text size="sm" tone="danger">
            {errors.customer}
          </Text>
        )}
      </FormSection>

      <FormSection
        title="Условия"
        summary={conditionSummary}
        isOpen={openSections.conditions}
        onToggle={() => {
          toggleSection('conditions')
        }}
      >
        <Text tone="secondary" size="sm">
          Чтобы код сработал, заявка должна выполнять все условия сразу. Сумма и количество
          считаются до скидок, подарки не в счёт.
        </Text>

        <PromotionConditionBuilder
          value={conditions}
          onChange={setConditions}
          catalog={scopedCatalog}
          errors={isSubmitted ? builtConditions.errors : {}}
          maxRows={MAX_PROMOTION_CONDITIONS}
        />
      </FormSection>

      <FormSection
        title="Награды"
        summary={rewardSummary}
        isOpen={openSections.rewards}
        onToggle={() => {
          toggleSection('rewards')
        }}
      >
        <PromotionRewardBuilder
          value={rewards}
          onChange={setRewards}
          catalog={scopedCatalog}
          errors={isSubmitted ? builtRewards.errors : {}}
          maxRows={MAX_PROMOTION_REWARDS}
          allowPromoCode={false}
        />

        {isSubmitted && errors.rewards !== null && (
          <Text size="sm" tone="danger">
            {errors.rewards}
          </Text>
        )}
      </FormSection>

      {/*
        Ошибка сервера - у кнопки, а не над формой: на телефоне верх формы в этот
        момент за краем экрана.
      */}
      {error !== undefined && error !== null && !(isSubmitted && hasErrors) && (
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
          {isSaved ? 'Сохранить' : 'Создать промокод'}
        </Button>
        {footer}
      </div>
    </form>
  )
}
