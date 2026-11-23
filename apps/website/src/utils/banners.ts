import type { IAdminBannerItem, IBannerSlide, IBannerSlideDto, IPromotion } from 'widgets/types'
import type { INewsBannerDraft } from 'widgets/types'
import type { INewsBannerInput } from '@/services/endpoints/banners'
import type { IDeleteConfirmation } from '@/utils/promotions'

/**
 * Баннеры карусели: перевод ответа API в слайды виджета и значений формы
 * новости в тело запроса. Живёт в приложении: адреса страниц - его знание.
 */

/**
 * Внешняя ссылка - только `https://`. Своя копия правила виджетов: этот файл читают тесты
 * приложения, а `widgets/utils` тянет стили, которые vitest сайта не собирает.
 */
const isExternal = (href: string): boolean => href.startsWith('https://')

/** Адрес страницы акции: слайд акции - ссылка на неё. */
export const promotionHref = (slug: string): string => `/promotions/${slug}`

/**
 * Слайд из ответа API. Акция ведёт на свою страницу, новость - по своей ссылке
 * (или никуда, если ссылки нет); внешней считается только `https://`.
 */
export const toBannerSlide = (dto: IBannerSlideDto): IBannerSlide => {
  const href = dto.promotionSlug === null ? dto.linkUrl : promotionHref(dto.promotionSlug)

  return {
    key: dto.key,
    kind: dto.kind,
    title: dto.title,
    text: dto.text,
    imageMobileUrl: dto.imageMobileUrl,
    imageDesktopUrl: dto.imageDesktopUrl,
    href,
    isExternal: href !== null && isExternal(href),
    ctaLabel: dto.ctaLabel,
  }
}

export const toBannerSlides = (feed: readonly IBannerSlideDto[]): IBannerSlide[] =>
  feed.map(toBannerSlide)

/** Превью «Сейчас на витрине»: показываемые слайды списка, в его порядке. */
export const shownSlides = (items: readonly IAdminBannerItem[]): IBannerSlide[] =>
  toBannerSlides(items.filter(item => item.state === 'SHOWN').map(item => item.slide))

/** Значения формы новости → тело `POST`/`PUT`. Картинки уходят отдельными запросами. */
export const toNewsBannerInput = (values: INewsBannerDraft): INewsBannerInput => ({
  title: values.title,
  text: values.text,
  linkUrl: values.linkUrl,
  ctaLabel: values.ctaLabel,
  startsAt: values.startsAt,
  endsAt: values.endsAt,
  isEnabled: values.isEnabled,
})

/**
 * Выбор владельца в списке «сразу», до ответа сервера. Показан или скрыт слайд -
 * зависит и от выбора, и от остального (выключенная акция остаётся выключенной,
 * запланированная - запланированной), поэтому состояние меняется только у тех,
 * что были `SHOWN` или `HIDDEN`; остальное досчитает ответ сервера.
 */
export const withShown = (item: IAdminBannerItem, isShown: boolean): IAdminBannerItem => ({
  ...item,
  isShown,
  state:
    item.state === 'SHOWN' || item.state === 'HIDDEN' ? (isShown ? 'SHOWN' : 'HIDDEN') : item.state,
})

/** Список в порядке `keys`, с позициями по месту: как после `PUT /admin/banners/order`. */
export const arrangedBy = (
  items: readonly IAdminBannerItem[],
  keys: readonly string[]
): IAdminBannerItem[] => {
  const byKey = new Map(items.map(item => [item.key, item]))

  return keys.flatMap((key, position) => {
    const item = byKey.get(key)

    return item === undefined ? [] : [{ ...item, position }]
  })
}

/** Список с подменённой строкой: ответ сервера на переключатель. */
export const replacedItem = (
  items: readonly IAdminBannerItem[],
  saved: IAdminBannerItem
): IAdminBannerItem[] => items.map(item => (item.key === saved.key ? saved : item))

export const deleteNewsConfirmation = (item: IAdminBannerItem): IDeleteConfirmation => ({
  title: 'Удалить новость?',
  description: `«${item.slide.title}» исчезнет из карусели и из списка вместе с картинками. Это нельзя отменить - если новость понадобится позже, лучше выключить её.`,
  confirmLabel: 'Удалить',
})

/**
 * Строка карточки акции о карусели: что решил владелец и показывается ли слайд на самом
 * деле. Слайд появляется, когда акция идёт, у неё есть мобильный баннер и выбор включён.
 * Причины проверяются в том же порядке, что и в `_promotion_state` на сервере, чтобы
 * карточка называла ту же причину, что и значок в «Баннерах».
 */
export const carouselLine = (promotion: {
  showInCarousel: boolean
  bannerMobileUrl: string | null
  status: IPromotion['status']
}): string => {
  switch (promotion.status) {
    case 'DISABLED':
      return 'Карусель: не показывается - акция выключена'
    case 'FINISHED':
      return 'Карусель: не показывается - акция закончилась'
    case 'SCHEDULED':
      return 'Карусель: покажется, когда акция начнётся'
    case 'ARCHIVED':
      return 'Карусель: не показывается - акция в архиве'
    default:
      break
  }

  if (promotion.bannerMobileUrl === null) {
    return 'Карусель: не показывается - нет мобильного баннера'
  }

  if (!promotion.showInCarousel) {
    return 'Карусель: скрыта вами'
  }

  return 'Карусель: показывается'
}
