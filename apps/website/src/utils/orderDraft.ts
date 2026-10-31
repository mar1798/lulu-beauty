import type { IAdminOrderDraftLine, IProduct } from 'widgets/types'
import { primaryImage } from 'widgets/molecules'
import { imagesForVariant } from 'widgets/utils'

/** Потолок количества — тот же, что у бэкенда (`MAX_ITEM_QUANTITY`). */
export const MAX_QUANTITY = 999

/** Количество в строке черновика: от одного до потолка. */
export const clampQuantity = (quantity: number): number =>
  Math.min(Math.max(quantity, 1), MAX_QUANTITY)

/**
 * Объём из выдачи поиска — строкой черновика заявки, как его снимет в заявку
 * бэкенд: фото выбранного тона, цена каталога, одна штука. Общая для новой
 * заявки и правки чужой: строка, собранная в двух местах по-разному,
 * выглядела бы по-разному в двух окнах.
 *
 * `null` — объёма нет в выдаче (поиск успел смениться между кликом и вызовом).
 */
export const catalogLine = (
  products: IProduct[] | null,
  variantId: string
): IAdminOrderDraftLine | null => {
  const product = products?.find(candidate =>
    candidate.variants.some(variant => variant.id === variantId)
  )
  const variant = product?.variants.find(candidate => candidate.id === variantId)

  if (product === undefined || variant === undefined) {
    return null
  }

  return {
    variantId,
    productName: product.name,
    productSlug: product.slug,
    // Фото выбранного тона, как его снимет в заявку бэкенд (`variant_image`).
    productImageUrl:
      imagesForVariant(product.images, variant)[0]?.url ??
      primaryImage(product.images)?.url ??
      null,
    productBrand: product.brand,
    productVolumeMl: variant.volumeMl,
    productShade: variant.shade ?? null,
    priceCents: variant.priceCents,
    quantity: 1,
  }
}
