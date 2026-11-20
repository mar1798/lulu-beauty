import type {
  DiscountKind,
  ICart,
  ICartGift,
  ICartPromotions,
  IOrderPromoCode,
  IPromoCodeDraft,
  IPromotionCodeReward,
  IPromotionCondition,
  IPromotionConditionDraft,
  IPromotionDiscountReward,
  IPromotionGiftReward,
  IPromotionPromoCodeReward,
  IPromotionReward,
  IPromotionRewardDraft,
  IPromotionRowErrors,
  IPromotionTarget,
  PromoCodeView,
  PromotionBannerVariant,
  PromotionConditionType,
  PromotionRewardType,
  PromotionStatus,
} from '../types'
import { formatPrice } from '../atoms/price/Price'
import { storeIso, toStoreParts } from './datetime'
import { MAX_PRICE_CENTS, parsePrice, priceToInput } from './priceInput'
import { pluralize } from './plural'

/**
 * Акции в админке: подписи, черновики строк конструктора и их перевод в тело
 * запроса и обратно.
 *
 * Деньги здесь не считаются — арифметику скидок ведёт бэкенд. Файл отвечает за
 * другое: человек набирает числа строками («1 500», «10»), а API ждёт тыйыны и
 * целые, и ошибку нужно показать у той строки, где она случилась, а не после
 * отказа сервера.
 *
 * Пределы повторяют `apps/api/app/common/limits.py` и `promotions/rules.py`.
 */

/** `MAX_PROMOTION_CONDITIONS` / `MAX_PROMOTION_REWARDS` бэкенда. */
export const MAX_PROMOTION_CONDITIONS = 10
export const MAX_PROMOTION_REWARDS = 10
/** `MAX_GIFT_QUANTITY`. */
export const MAX_GIFT_QUANTITY = 10
/** `MAX_PROMO_CODE_VALID_DAYS`. */
export const MAX_PROMO_CODE_VALID_DAYS = 365
/** Потолок `QUANTITY` (`min_quantity` в `rules.py`). */
export const MAX_CONDITION_QUANTITY = 10_000
/** Название подарка по умолчанию — как `DEFAULT_GIFT_TITLE` бэкенда. */
export const DEFAULT_GIFT_TITLE = 'Mystery box'
const GIFT_TITLE_MAX_LENGTH = 255
const PERCENT_MAX = 100

/* ------------------------------------------------------------------ *
 * Статусы и баннеры
 * ------------------------------------------------------------------ */

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  DISABLED: 'Выключена',
  SCHEDULED: 'Запланирована',
  ACTIVE: 'Активна',
  FINISHED: 'Завершена',
  ARCHIVED: 'В архиве',
}

export const PROMOTION_STATUS_TONES: Record<
  PromotionStatus,
  'neutral' | 'success' | 'info' | 'warning'
> = {
  DISABLED: 'neutral',
  SCHEDULED: 'info',
  ACTIVE: 'success',
  FINISHED: 'neutral',
  ARCHIVED: 'warning',
}

export const PROMO_CODE_STATUS_LABELS: Record<PromoCodeView, string> = {
  ACTIVE: 'активен',
  RESERVED: 'в заявке',
  USED: 'использован',
  REVOKED: 'отозван',
  EXPIRED: 'истёк',
}

export interface IBannerSpec {
  title: string
  /** Рекомендованный размер файла в пикселях. */
  width: number
  height: number
  /** Подпись соотношения сторон: «3 : 2». */
  ratioLabel: string
}

/**
 * Рекомендованные баннеры карусели. Соотношение у каждого варианта своё и
 * фиксированное — карусель на витрине держит те же пропорции, иначе слайды
 * прыгали бы по высоте.
 */
export const BANNER_SPECS: Record<PromotionBannerVariant, IBannerSpec> = {
  mobile: { title: 'Мобильный', width: 1080, height: 720, ratioLabel: '3 : 2' },
  desktop: { title: 'Десктоп', width: 1920, height: 640, ratioLabel: '3 : 1' },
}

/** Файлы, которые принимает бэкенд (`app/common/uploads.py`). */
export const BANNER_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const BANNER_MAX_BYTES = 15 * 1024 * 1024

/* ------------------------------------------------------------------ *
 * Цели
 * ------------------------------------------------------------------ */

export const emptyTarget = (): IPromotionTarget => ({
  productIds: [],
  categoryIds: [],
  brands: [],
})

export const isTargetEmpty = (target: IPromotionTarget | null | undefined): boolean =>
  target === null ||
  target === undefined ||
  (target.productIds.length === 0 && target.categoryIds.length === 0 && target.brands.length === 0)

/* ------------------------------------------------------------------ *
 * Описание словами: строка таблицы, участники, промокод
 * ------------------------------------------------------------------ */

const describeTargetSuffix = (target: IPromotionTarget | null | undefined): string =>
  isTargetEmpty(target) ? '' : ' на выбранное'

const describeCondition = (condition: IPromotionCondition): string => {
  switch (condition.type) {
    case 'SUBTOTAL':
      return `от ${formatPrice(condition.minCents)}${describeTargetSuffix(condition.target)}`
    case 'QUANTITY':
      return `от ${pluralize(condition.minQuantity, ['штуки', 'штук', 'штук'])}${describeTargetSuffix(condition.target)}`
    case 'CONTAINS':
      return condition.mode === 'ALL' ? 'все выбранные товары' : 'любой из выбранных товаров'
  }
}

export const describeConditions = (conditions: IPromotionCondition[]): string =>
  conditions.length === 0 ? 'без условий' : conditions.map(describeCondition).join(', ')

const describeDiscount = (reward: IPromotionDiscountReward): string => {
  const amount = reward.kind === 'PERCENT' ? `${reward.value}%` : formatPrice(reward.value)

  return `Скидка ${amount}${isTargetEmpty(reward.target) ? '' : ' на выбранные товары'}`
}

const describeGift = (reward: IPromotionGiftReward): string =>
  `Подарок: ${reward.title}${reward.quantity > 1 ? ` × ${reward.quantity}` : ''}`

const describePromoCode = (reward: IPromotionPromoCodeReward): string => {
  const validity =
    reward.validDays === null
      ? 'на период'
      : `на ${pluralize(reward.validDays, ['день', 'дня', 'дней'])}`
  const inside = reward.rewards.map(describeRewardOnly).join(', ')

  return `Промокод ${validity}: ${inside.toLowerCase()}`
}

function describeRewardOnly(reward: IPromotionCodeReward): string {
  return reward.type === 'DISCOUNT' ? describeDiscount(reward) : describeGift(reward)
}

export const describeReward = (reward: IPromotionReward): string => {
  switch (reward.type) {
    case 'DISCOUNT':
      return describeDiscount(reward)
    case 'GIFT':
      return describeGift(reward)
    case 'PROMO_CODE':
      return describePromoCode(reward)
  }
}

/** Награды акции короткими строками — для ячейки таблицы и списка участников. */
export const describeRewards = (rewards: IPromotionReward[]): string[] =>
  rewards.map(describeReward)

/** «Скидка 10% · Подарок: Mystery box» — одной строкой. */
export const describeRewardsLine = (rewards: IPromotionReward[]): string =>
  describeRewards(rewards).join(' · ')

export { describeCondition }

/** Кратко о настройках промокода в строке награды: срок и сколько наград. */
export const describePromoCodeDraft = (draft: IPromoCodeDraft | null): string | null => {
  if (draft === null || draft.rewards.length === 0) {
    return null
  }

  const validity =
    draft.validity === 'DAYS'
      ? `${draft.validDays} дн.`
      : `${draft.validFromDate} - ${draft.validUntilDate}`

  return `Настроен: срок ${validity}, наград - ${draft.rewards.length}, условий - ${draft.conditions.length}`
}

/* ------------------------------------------------------------------ *
 * Черновики
 * ------------------------------------------------------------------ */

let keyCounter = 0

/** Ключ строки для React: стабильный, пока строка живёт в списке. */
export const nextDraftKey = (): string => {
  keyCounter += 1

  return `row-${keyCounter}`
}

export const newConditionDraft = (
  type: PromotionConditionType = 'SUBTOTAL'
): IPromotionConditionDraft => ({
  key: nextDraftKey(),
  type,
  amount: '',
  quantity: '',
  mode: 'ANY',
  hasTarget: false,
  target: emptyTarget(),
})

export const newRewardDraft = (type: PromotionRewardType = 'DISCOUNT'): IPromotionRewardDraft => ({
  key: nextDraftKey(),
  type,
  kind: 'PERCENT',
  value: '',
  hasTarget: false,
  target: emptyTarget(),
  gift: 'CUSTOM',
  giftTitle: DEFAULT_GIFT_TITLE,
  giftImageUrl: null,
  giftVariantId: null,
  giftQuantity: '1',
  promoCode: type === 'PROMO_CODE' ? newPromoCodeDraft() : null,
})

export const newPromoCodeDraft = (): IPromoCodeDraft => ({
  validity: 'DAYS',
  validDays: '30',
  validFromDate: '',
  validUntilDate: '',
  conditions: [],
  rewards: [],
})

const cloneTarget = (target: IPromotionTarget | null | undefined): IPromotionTarget => ({
  productIds: [...(target?.productIds ?? [])],
  categoryIds: [...(target?.categoryIds ?? [])],
  brands: [...(target?.brands ?? [])],
})

export const conditionToDraft = (condition: IPromotionCondition): IPromotionConditionDraft => ({
  ...newConditionDraft(condition.type),
  amount: condition.type === 'SUBTOTAL' ? priceToInput(condition.minCents) : '',
  quantity: condition.type === 'QUANTITY' ? String(condition.minQuantity) : '',
  mode: condition.type === 'CONTAINS' ? condition.mode : 'ANY',
  hasTarget: condition.type === 'CONTAINS' || !isTargetEmpty(condition.target),
  target: cloneTarget(condition.target),
})

const datePart = (iso: string | null): string =>
  iso === null ? '' : (toStoreParts(iso)?.date ?? '')

export const rewardToDraft = (reward: IPromotionReward): IPromotionRewardDraft => {
  const draft = newRewardDraft(reward.type)

  if (reward.type === 'DISCOUNT') {
    return {
      ...draft,
      kind: reward.kind,
      value: reward.kind === 'PERCENT' ? String(reward.value) : priceToInput(reward.value),
      hasTarget: !isTargetEmpty(reward.target),
      target: cloneTarget(reward.target),
    }
  }

  if (reward.type === 'GIFT') {
    return {
      ...draft,
      gift: reward.gift,
      giftTitle: reward.title,
      giftImageUrl: reward.imageUrl,
      giftVariantId: reward.variantId,
      giftQuantity: String(reward.quantity),
    }
  }

  return {
    ...draft,
    promoCode: {
      validity: reward.validDays === null ? 'DATES' : 'DAYS',
      validDays: reward.validDays === null ? '30' : String(reward.validDays),
      validFromDate: datePart(reward.validFrom),
      validUntilDate: datePart(reward.validUntil),
      conditions: reward.conditions.map(conditionToDraft),
      rewards: reward.rewards.map(rewardToDraft),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Черновик → тело запроса
 * ------------------------------------------------------------------ */

type IResult<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): IResult<T> => ({ ok: true, value })
const fail = <T>(error: string): IResult<T> => ({ ok: false, error })

/** Целое от 1 до `max` из набранной строки. */
const parseWhole = (raw: string, max: number): number | null => {
  const text = raw.trim()

  if (!/^\d+$/.test(text)) {
    return null
  }

  const value = Number(text)

  return value >= 1 && value <= max ? value : null
}

const targetOf = (draft: {
  hasTarget: boolean
  target: IPromotionTarget
}): IPromotionTarget | null =>
  draft.hasTarget && !isTargetEmpty(draft.target) ? cloneTarget(draft.target) : null

const conditionFromDraft = (draft: IPromotionConditionDraft): IResult<IPromotionCondition> => {
  if (draft.type === 'SUBTOTAL') {
    const cents = parsePrice(draft.amount)

    if (cents === null || cents <= 0 || cents > MAX_PRICE_CENTS) {
      return fail('Укажите сумму в сомах, больше нуля')
    }

    return ok({ type: 'SUBTOTAL', minCents: cents, target: targetOf(draft) })
  }

  if (draft.type === 'QUANTITY') {
    const quantity = parseWhole(draft.quantity, MAX_CONDITION_QUANTITY)

    if (quantity === null) {
      return fail(`Укажите количество штук - целое число от 1 до ${MAX_CONDITION_QUANTITY}`)
    }

    return ok({ type: 'QUANTITY', minQuantity: quantity, target: targetOf(draft) })
  }

  if (isTargetEmpty(draft.target)) {
    return fail('Выберите хотя бы один товар, категорию или бренд')
  }

  return ok({ type: 'CONTAINS', target: cloneTarget(draft.target), mode: draft.mode })
}

const discountValue = (kind: DiscountKind, raw: string): number | null => {
  if (kind === 'PERCENT') {
    return parseWhole(raw, PERCENT_MAX)
  }

  const cents = parsePrice(raw)

  return cents === null || cents <= 0 || cents > MAX_PRICE_CENTS ? null : cents
}

const discountFromDraft = (draft: IPromotionRewardDraft): IResult<IPromotionDiscountReward> => {
  const value = discountValue(draft.kind, draft.value)

  if (value === null) {
    return fail(
      draft.kind === 'PERCENT'
        ? `Процент - целое число от 1 до ${PERCENT_MAX}`
        : 'Укажите сумму скидки в сомах, больше нуля'
    )
  }

  if (draft.hasTarget && isTargetEmpty(draft.target)) {
    return fail('Выберите товары, категории или бренды - или снимите ограничение')
  }

  return ok({ type: 'DISCOUNT', kind: draft.kind, value, target: targetOf(draft) })
}

const giftFromDraft = (draft: IPromotionRewardDraft): IResult<IPromotionGiftReward> => {
  const quantity = parseWhole(draft.giftQuantity, MAX_GIFT_QUANTITY)

  if (quantity === null) {
    return fail(`Количество подарков - от 1 до ${MAX_GIFT_QUANTITY}`)
  }

  if (draft.gift === 'PRODUCT') {
    if (draft.giftVariantId === null) {
      return fail('Выберите товар-подарок')
    }

    return ok({
      type: 'GIFT',
      gift: 'PRODUCT',
      title: draft.giftTitle.trim() === '' ? DEFAULT_GIFT_TITLE : draft.giftTitle.trim(),
      imageUrl: null,
      variantId: draft.giftVariantId,
      quantity,
    })
  }

  const title = draft.giftTitle.trim() === '' ? DEFAULT_GIFT_TITLE : draft.giftTitle.trim()

  if (title.length > GIFT_TITLE_MAX_LENGTH) {
    return fail(`Название подарка - не длиннее ${GIFT_TITLE_MAX_LENGTH} знаков`)
  }

  return ok({
    type: 'GIFT',
    gift: 'CUSTOM',
    title,
    imageUrl: draft.giftImageUrl,
    variantId: null,
    quantity,
  })
}

export interface IBuiltList<T> {
  value: T[]
  errors: IPromotionRowErrors
}

export const buildConditions = (
  drafts: IPromotionConditionDraft[]
): IBuiltList<IPromotionCondition> => {
  const value: IPromotionCondition[] = []
  const errors: IPromotionRowErrors = {}

  for (const draft of drafts) {
    const result = conditionFromDraft(draft)

    if (result.ok) {
      value.push(result.value)
    } else {
      errors[draft.key] = result.error
    }
  }

  return { value, errors }
}

const codeRewardsFrom = (drafts: IPromotionRewardDraft[]): IBuiltList<IPromotionCodeReward> => {
  const value: IPromotionCodeReward[] = []
  const errors: IPromotionRowErrors = {}

  for (const draft of drafts) {
    const result =
      draft.type === 'DISCOUNT'
        ? discountFromDraft(draft)
        : draft.type === 'GIFT'
          ? giftFromDraft(draft)
          : fail<IPromotionCodeReward>('Промокод не может выдавать другой промокод')

    if (result.ok) {
      value.push(result.value)
    } else {
      errors[draft.key] = result.error
    }
  }

  return { value, errors }
}

/** Настройки промокода: срок, условия, награды — или первая найденная ошибка. */
export const buildPromoCode = (
  draft: IPromoCodeDraft
): {
  value: IPromotionPromoCodeReward | null
  error: string | null
  errors: IPromotionRowErrors
} => {
  const conditions = buildConditions(draft.conditions)
  const rewards = codeRewardsFrom(draft.rewards)
  const errors = { ...conditions.errors, ...rewards.errors }
  let error: string | null = null

  let validDays: number | null = null
  let validFrom: string | null = null
  let validUntil: string | null = null

  if (draft.validity === 'DAYS') {
    validDays = parseWhole(draft.validDays, MAX_PROMO_CODE_VALID_DAYS)

    if (validDays === null) {
      error = `Срок - целое число дней от 1 до ${MAX_PROMO_CODE_VALID_DAYS}`
    }
  } else {
    validFrom = draft.validFromDate === '' ? null : storeIso(draft.validFromDate, '00:00')
    validUntil = draft.validUntilDate === '' ? null : storeIso(draft.validUntilDate, '23:59')

    if (validFrom === null || validUntil === null || validFrom === '' || validUntil === '') {
      error = 'Укажите обе даты: с какого и по какое число действует код'
    } else if (validUntil <= validFrom) {
      error = 'Код должен заканчиваться позже, чем начинается'
    }
  }

  if (draft.rewards.length === 0) {
    error ??= 'Добавьте, что даёт промокод: скидку или подарок'
  }

  if (error !== null || Object.keys(errors).length > 0) {
    return { value: null, error, errors }
  }

  return {
    value: {
      type: 'PROMO_CODE',
      validDays,
      validFrom,
      validUntil,
      conditions: conditions.value,
      rewards: rewards.value,
    },
    error: null,
    errors,
  }
}

/** Ключ строки-промокода внутри ошибок: сама строка и её настройки валидируются вместе. */
export const buildRewards = (drafts: IPromotionRewardDraft[]): IBuiltList<IPromotionReward> => {
  const value: IPromotionReward[] = []
  const errors: IPromotionRowErrors = {}

  for (const draft of drafts) {
    if (draft.type === 'PROMO_CODE') {
      const code = buildPromoCode(draft.promoCode ?? newPromoCodeDraft())
      const problem =
        code.error ??
        (Object.keys(code.errors).length > 0 ? 'В настройках промокода есть ошибки' : null)

      if (code.value === null) {
        errors[draft.key] = problem ?? 'Настройте промокод'
      } else {
        value.push(code.value)
      }

      continue
    }

    const result = draft.type === 'DISCOUNT' ? discountFromDraft(draft) : giftFromDraft(draft)

    if (result.ok) {
      value.push(result.value)
    } else {
      errors[draft.key] = result.error
    }
  }

  return { value, errors }
}

/* ------------------------------------------------------------------ *
 * Витрина: корзина, промокоды
 * ------------------------------------------------------------------ */

/** Корзина без акций: гостевая пустая, очищенная и всё, что ещё не получило ответа сервера. */
export const EMPTY_CART_PROMOTIONS: ICartPromotions = {
  applied: [],
  hints: [],
  gifts: [],
  itemsDiscountCents: 0,
  orderDiscountCents: 0,
  discountCents: 0,
  payableCents: 0,
}

/**
 * Сколько показать к оплате. Сумму считает сервер, здесь только выбор между
 * двумя его числами: без скидок - `totalCents` (клиент двигает его оптимистично,
 * пока запрос в пути, и `payableCents` ему не поспевает), со скидками - ответ
 * сервера про акции.
 */
export const cartPayableCents = (cart: Pick<ICart, 'totalCents' | 'promotions'>): number =>
  cart.promotions.discountCents > 0 ? cart.promotions.payableCents : cart.totalCents

/** Что даёт код, одной строкой: «Скидка 10% · Подарок: Mystery box». */
export const describePromoCodeRewards = (code: Pick<IOrderPromoCode, 'rewards'>): string =>
  describeRewardsLine(code.rewards)

/** При каких условиях код работает; пустая строка - без условий. */
export const describePromoCodeConditions = (code: Pick<IOrderPromoCode, 'conditions'>): string =>
  code.conditions.length === 0 ? '' : describeConditions(code.conditions)

/**
 * Откуда подарок: название акции, чьи подарки его содержат. Сервер отдаёт подарки
 * и общим списком, и по акциям - здесь они сопоставляются по содержимому, потому
 * что собственного идентификатора у виртуального подарка нет.
 */
export const giftSource = (promotions: ICartPromotions, gift: ICartGift): string | null => {
  const owner = promotions.applied.find(entry =>
    entry.gifts.some(
      candidate =>
        candidate.title === gift.title &&
        candidate.productId === gift.productId &&
        candidate.variantId === gift.variantId
    )
  )

  return owner === undefined ? null : `Акция «${owner.title}»`
}
