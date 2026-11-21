import type { ICartPromotions } from 'widgets/types'

/**
 * Корзина без акций: пустая гостевая, очищенная и всё, что клиент собирает сам.
 *
 * Лежит отдельно от `widgets/utils`: контекст корзины подключается и в тестах, а
 * те не собирают компоненты виджетов (см. `vitest.config.mts`). Копия
 * `EMPTY_CART_PROMOTIONS` из `widgets/utils/promotion.ts` - одна и та же форма
 * ответа сервера без единой акции.
 */
export const NO_PROMOTIONS: ICartPromotions = {
  applied: [],
  hints: [],
  gifts: [],
  itemsDiscountCents: 0,
  orderDiscountCents: 0,
  discountCents: 0,
  payableCents: 0,
}
