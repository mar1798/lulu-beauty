import { useCallback, useMemo, useRef } from 'react'
import useSWR from 'swr'
import type {
  ICategory,
  IPromotionCatalog,
  IPromotionCondition,
  IPromotionReward,
  IPromotionTarget,
} from 'widgets/types'
import { messageForError } from '@/services/apiErrors'
import { getAdminProduct, listAdminBrands } from '@/services/endpoints/admin'
import { listCategories } from '@/services/endpoints/catalog'
import { searchProductsForPromotion, uploadGiftImage } from '@/services/endpoints/promotions'
import { adminBrandsKey, adminPromotionProductLabelsKey, categoriesKey } from '@/services/swrKeys'

/**
 * Всё, что конструктору условий и наград нужно из каталога: категории, бренды,
 * поиск товаров, загрузка картинки подарка и названия товаров, уже выбранных в
 * акции.
 *
 * В акции лежат только id (товары, категории), поэтому названия товаров
 * дочитываются отдельно — по одному `GET /admin/products/{id}`: отдельной ручки
 * «товары по списку id» нет, а в акции их единицы. Товар, который не нашёлся
 * (удалён насовсем), просто остаётся без названия — виджет подпишет его «Товар
 * удалён».
 *
 * `labels` стабилен между рендерами, пока не изменился набор id: форма
 * подмешивает его в свои названия эффектом и не должна перезапускать его впустую.
 */

const collectTarget = (target: IPromotionTarget | null | undefined, into: Set<string>): void => {
  for (const id of target?.productIds ?? []) {
    into.add(id)
  }
}

/** Все товары, на которые ссылаются условия и награды, включая вложенные в промокод. */
export const referencedProductIds = (
  conditions: IPromotionCondition[],
  rewards: IPromotionReward[]
): string[] => {
  const ids = new Set<string>()

  const visit = (
    innerConditions: IPromotionCondition[],
    innerRewards: IPromotionReward[]
  ): void => {
    for (const condition of innerConditions) {
      collectTarget(condition.target, ids)
    }

    for (const reward of innerRewards) {
      if (reward.type === 'DISCOUNT') {
        collectTarget(reward.target, ids)
      } else if (reward.type === 'PROMO_CODE') {
        visit(reward.conditions, reward.rewards)
      }
    }
  }

  visit(conditions, rewards)

  return [...ids].sort()
}

const fetchLabels = async (ids: string[]): Promise<Record<string, string>> => {
  const found = await Promise.all(
    ids.map(async id => {
      try {
        const product = await getAdminProduct(id)

        return [id, product.name] as const
      } catch {
        return null
      }
    })
  )

  return Object.fromEntries(found.filter(entry => entry !== null))
}

const NO_CATEGORIES: ICategory[] = []
const NO_BRANDS: string[] = []

export const usePromotionCatalog = (
  conditions: IPromotionCondition[] = [],
  rewards: IPromotionReward[] = []
): IPromotionCatalog => {
  const { data: categories } = useSWR(categoriesKey, () => listCategories())
  // С удалёнными товарами: бренд, оставшийся только на снятом с продажи, тоже уже заведён.
  const { data: brands } = useSWR(adminBrandsKey(true), () => listAdminBrands(true))

  const ids = useMemo(() => referencedProductIds(conditions, rewards), [conditions, rewards])
  const idsKey = ids.join(',')
  const { data: labels } = useSWR(
    ids.length === 0 ? null : adminPromotionProductLabelsKey(idsKey),
    () => fetchLabels(ids)
  )

  // Названия, выбранные в самой форме, держит форма; сюда они приходят только для порядка.
  const picked = useRef<Record<string, string>>({})
  const onLabel = useCallback((id: string, label: string): void => {
    picked.current[id] = label
  }, [])

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    try {
      return await uploadGiftImage(file)
    } catch (cause: unknown) {
      throw new Error(messageForError(cause, 'admin.promotion.giftImage'))
    }
  }, [])

  return useMemo(
    () => ({
      categories: categories ?? NO_CATEGORIES,
      brands: brands ?? NO_BRANDS,
      searchProducts: searchProductsForPromotion,
      labels: labels ?? {},
      onLabel,
      uploadGiftImage: uploadImage,
    }),
    [categories, brands, labels, onLabel, uploadImage]
  )
}
