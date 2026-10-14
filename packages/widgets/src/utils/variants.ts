import type { IProductImage, IProductVariant } from '../types'
import { pluralize } from './plural'
import { formatVolume } from './volume'

/**
 * По чему сравниваются тона: без регистра и лишних пробелов. Тем же правилом
 * их сравнивает бэкенд (`shade_key` в `app/catalog/shades.py`): «05 rose» из
 * прайса — тот же тон, что «05 Rose» в каталоге.
 */
export const shadeKey = (shade: string | null | undefined): string | null => {
  const normalized = (shade ?? '').split(/\s+/).filter(Boolean).join(' ')

  return normalized === '' ? null : normalized.toLowerCase()
}

/**
 * Вариант словами: «50 мл, 05 Rose», «50 мл», «05 Rose» — или `null`, когда
 * назвать нечего. Порядок тот же, что у бэкенда (`variant_label`): в заявке,
 * в уведомлении бота и в листе закупки одна позиция называется одинаково.
 */
export const formatVariant = (
  volumeMl: number | null | undefined,
  shade: string | null | undefined
): string | null => {
  const parts = [formatVolume(volumeMl), shade?.trim() || null].filter(
    (part): part is string => part !== null
  )

  return parts.length === 0 ? null : parts.join(', ')
}

/** Объёмы товара по порядку, без повторов: у товара с тонами объём повторяется в каждом тоне. */
export const variantVolumes = (
  variants: Pick<IProductVariant, 'volumeMl'>[]
): Array<number | null> =>
  variants.reduce<Array<number | null>>(
    (volumes, variant) =>
      volumes.includes(variant.volumeMl) ? volumes : [...volumes, variant.volumeMl],
    []
  )

/** Тона товара по порядку, без повторов (по `shadeKey`); пусто — товар без тонов. */
export const variantShades = (variants: Pick<IProductVariant, 'shade'>[]): string[] => {
  const seen = new Set<string>()
  const shades: string[] = []

  for (const variant of variants) {
    const key = shadeKey(variant.shade)

    if (key !== null && variant.shade !== null && variant.shade !== undefined && !seen.has(key)) {
      seen.add(key)
      shades.push(variant.shade)
    }
  }

  return shades
}

/**
 * Стоят ли варианты по-разному. Тогда цена товара — минимум и пишется с «от»;
 * у помады в десяти тонах одна цена, и «от» про неё было бы неправдой.
 */
export const hasPriceRange = (variants: IProductVariant[]): boolean =>
  new Set(variants.map(variant => variant.priceCents)).size > 1

/** «12 оттенков» — для карточки в сетке, где выбирать тон негде. */
export const formatShadeCount = (variants: IProductVariant[]): string | null => {
  const count = variantShades(variants).length

  return count > 1 ? pluralize(count, ['оттенок', 'оттенка', 'оттенков']) : null
}

/**
 * Фотографии для выбранного варианта: подходящие, самые точные первыми.
 *
 * Фото с метками объёмов или тонов показывается только у вариантов, у которых
 * есть один из этих объёмов и один из этих тонов (пустой список — «любой»).
 * Из подходящих первыми идут самые точные: с тонами и объёмами, потом с одними
 * тонами, потом с одними объёмами, потом общие. Тон весомее объёма — помады
 * разных тонов выглядят по-разному, а 30 и 50 мл одного крема одинаково.
 * Сколько тонов на фото, не важно: снимок двух тюбиков — фото каждого из них.
 * При равенстве — главное фото, затем порядок галереи.
 *
 * Возвращаются копии с новым `sortOrder` и главным первым: галерея откроется
 * на самом точном фото, ничего не зная о вариантах. Если не подходит ничего,
 * возвращается вся галерея как есть, чтобы страница не осталась без фото.
 * Скрытые фото (`hidden`) не возвращаются никогда: витрине их не отдаёт и API.
 *
 * То же правило, что у `variant_image` в `app/catalog/images.py`, которым
 * бэкенд выбирает фото для корзины и заявки, — держать их в шаге.
 */
/** Тона фото в виде ключей сравнения (`shadeKey`) — как их сверяет сервер. */
const imageShadeKeys = (image: IProductImage): string[] =>
  (image.shades ?? []).map(shadeKey).filter((key): key is string => key !== null)

export const imagesForVariant = (
  images: IProductImage[],
  variant: Pick<IProductVariant, 'volumeMl' | 'shade'> | null
): IProductImage[] => {
  // Когда прятать нечего — тот же массив, без лишней копии.
  const shown = images.some(image => image.hidden === true)
    ? images.filter(image => image.hidden !== true)
    : images

  if (variant === null) {
    return shown
  }

  const key = shadeKey(variant.shade)
  const scored = shown
    .filter(image => {
      const volumes = image.volumesMl ?? []
      const keys = imageShadeKeys(image)

      return (
        (volumes.length === 0 ||
          (variant.volumeMl !== null && volumes.includes(variant.volumeMl))) &&
        (keys.length === 0 || (key !== null && keys.includes(key)))
      )
    })
    .map(image => ({
      image,
      score:
        (imageShadeKeys(image).length > 0 ? 2 : 0) + ((image.volumesMl ?? []).length > 0 ? 1 : 0),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.image.isPrimary) - Number(left.image.isPrimary) ||
        left.image.sortOrder - right.image.sortOrder
    )

  if (scored.length === 0) {
    return shown
  }

  return scored.map(({ image }, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 }))
}

/** Объёмы, к которым привязывают фото: когда их больше одного, иначе выбирать не из чего. */
export const taggableVolumes = (variants: Pick<IProductVariant, 'volumeMl'>[]): number[] => {
  const volumes = variantVolumes(variants).filter((volume): volume is number => volume !== null)

  return volumes.length > 1 ? volumes : []
}
