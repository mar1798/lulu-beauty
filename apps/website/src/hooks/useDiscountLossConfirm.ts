import { useCallback } from 'react'
import { useConfirm } from 'widgets/contexts'
import type { IOrder, IPromotionRef } from 'widgets/types'
import { lostDiscounts } from 'widgets/utils'
import { previewMyOrderEdit, type IOrderEditTarget } from '@/services/endpoints/orders'

/**
 * Что из скидок снимет правка покупателя — зеркало `_customer_changed` в API.
 *
 * Скидку магазин давал на заявку в том составе, какой видел. Любая правка
 * покупателя снимает скидку на всю заявку, а правка строки — ещё и скидку
 * этой строки (строки, которых правка не касается, свою сохраняют).
 *
 * `itemIds` — строки, которые правка меняет; пусто, если затронута только
 * заявка целиком (новый объём, которого в ней ещё нет). Возвращает текст
 * предупреждения или `null`, если снимать нечего.
 */
export const discountLoss = (order: IOrder, itemIds: readonly string[]): string | null => {
  const lost = lostDiscounts(order, itemIds)

  if (lost.length === 0) {
    return null
  }

  const subject =
    lost.length > 1 ? `${lost.slice(0, -1).join(', ')} и ${lost[lost.length - 1]}` : lost[0]
  const isMany = lost.length > 1

  return (
    `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ` +
    `${isMany ? 'будут сняты' : 'будет снята'} - магазин давал ${isMany ? 'их' : 'её'} ` +
    'на прежний состав заявки'
  )
}

/**
 * Акции, которые правка снимет с заявки, - словами для диалога подтверждения.
 *
 * Какие именно, решает сервер (`lostPromotions` в `POST /orders/{id}/edit-preview`):
 * условия акций и их порядок остаются у него, сайт только называет их.
 */
export const promotionLoss = (lost: readonly Pick<IPromotionRef, 'title'>[]): string | null => {
  const titles = lost.map(entry => `«${entry.title}»`)

  if (titles.length === 0) {
    return null
  }

  if (titles.length === 1) {
    return `Акция ${titles[0]} перестанет действовать - условия больше не выполняются`
  }

  return `Акции ${titles.slice(0, -1).join(', ')} и ${titles[titles.length - 1]} перестанут действовать - условия больше не выполняются`
}

/**
 * Что правка отнимет у заявки по версии сервера. Осечка запроса молчит: это
 * предупреждение, а не решение, и сама правка ответит на всё, что действительно
 * неверно (устаревшая `revision`, закрытый сбор). Заявке без акций спрашивать
 * не о чем - запроса нет.
 *
 * Правки считаются каждая от текущей заявки, а не друг от друга (предпросмотр
 * ничего не сохраняет), и результат объединяется по акции.
 */
export const lostPromotions = async (
  order: IOrder,
  edits: readonly IOrderEditTarget[]
): Promise<IPromotionRef[]> => {
  if (order.promotions.length === 0 || edits.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    edits.map(edit => previewMyOrderEdit(order.id, order.revision, edit))
  )
  const lost = new Map<string, IPromotionRef>()

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const entry of result.value.lostPromotions) {
        lost.set(entry.promotionId, entry)
      }
    }
  }

  return [...lost.values()]
}

/** Строки, к которым прибавятся эти объёмы: тот же объём сливается со своей строкой. */
export const linesOfVariants = (order: IOrder, variantIds: readonly string[]): string[] =>
  order.items
    .filter(item => item.variantId !== null && variantIds.includes(item.variantId))
    .map(item => item.id)

/**
 * Подтверждение правки, которая снимет скидку или акцию. Если снимать нечего,
 * спрашивать не о чем — сразу `true`.
 *
 * Скидки владельца считает зеркало на клиенте (`discountLoss`), акции - сервер:
 * `edits` описывает правку так же, как `POST /orders/{id}/edit-preview` (строка и
 * новое количество, `0` - убрать; либо добавляемый объём). Без `edits` акции не
 * проверяются - так звали хук до акций.
 */
export const useDiscountLossConfirm = (): ((
  order: IOrder,
  itemIds: readonly string[],
  edits?: readonly IOrderEditTarget[]
) => Promise<boolean>) => {
  const { confirm } = useConfirm()

  return useCallback(
    async (
      order: IOrder,
      itemIds: readonly string[],
      edits: readonly IOrderEditTarget[] = []
    ): Promise<boolean> => {
      const loss = [discountLoss(order, itemIds), promotionLoss(await lostPromotions(order, edits))]
        .filter((line): line is string => line !== null)
        .join('. ')

      if (loss === '') {
        return true
      }

      return confirm({
        title: 'Изменить заявку?',
        description: loss,
        confirmLabel: 'Изменить',
        cancelLabel: 'Не менять',
        tone: 'danger',
      })
    },
    [confirm]
  )
}
