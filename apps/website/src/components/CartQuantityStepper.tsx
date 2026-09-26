import React, { useCallback } from 'react'
import { useToast } from 'widgets/contexts'
import { QuantityStepper } from 'widgets/molecules'
import { useCart } from '@/contexts/CartContext'

/**
 * Количество позиции, уже лежащей в корзине, — на странице товара, слева от
 * ужатой в круг кнопки.
 *
 * Правит корзину сразу, теми же `updateItem`/`removeItem`, что и степпер
 * внутри `/cart`: число, показанное на витрине, обязано быть числом из
 * заявки, а не ещё одной копией, которую потом надо сводить. Поэтому и
 * собственного состояния у него нет — только то, что вернул сервер.
 *
 * Шаг вниз с единицы убирает позицию (`min = 0`), и строка действий
 * разворачивается обратно в подписанную «В корзину». Это единственный способ
 * отменить добавление, не уходя в корзину: кнопка рядом к этому моменту уже
 * ссылка. Поэтому удаление, как и крестик в `/cart`, идёт с тостом «Вернуть»:
 * промах по «−» на телефоне иначе молча убирал товар.
 *
 * Позиции нет — рисуется погашенная единица. Показать её всё равно некому:
 * `ProductDetails` держит этот слот свёрнутым в ноль, — но содержимое обязано
 * быть на месте, пока коробка вокруг него доезжает до нуля после удаления.
 *
 * На время своего же запроса не гаснет: количество меняется оптимистично,
 * запросы уходят по очереди, и быстрые нажатия должны складываться
 * (2 → 3 → 4) — та же причина, по которой не гаснет степпер в корзине
 * (см. `CartPanel`).
 */

/** Столько лежит в корзине сразу после нажатия «в корзину». */
const ONE = 1

/** Позицию убирают шагом вниз с единицы — см. `min = 0` у степпера. */
const REMOVE = 0

export const CartQuantityStepper: React.FC<{
  /** Объём: строка корзины адресуется им, а не товаром. */
  variantId: string | null
  /** Уходит в подпись группы — рядом с ней на странице есть и другие кнопки. */
  productName: string
}> = ({ variantId, productName }) => {
  const { cart, updateItem, removeItem, addItem } = useCart()
  const { notify } = useToast()

  const line =
    variantId === null ? undefined : cart?.items.find(item => item.variantId === variantId)

  const label = `Количество: ${productName}`

  /** Возврат убранной позиции — заново, с той единицей, с которой её убрали. */
  const restore = useCallback(
    async (target: string): Promise<void> => {
      const result = await addItem(target, ONE)

      if (!result.ok) {
        notify({
          tone: 'danger',
          title: 'Вернуть не получилось',
          description: result.error ?? 'Попробуйте добавить товар ещё раз',
        })
      }
    },
    [addItem, notify]
  )

  const change = useCallback(
    async (quantity: number): Promise<void> => {
      if (variantId === null) {
        return
      }

      const result =
        quantity === REMOVE ? await removeItem(variantId) : await updateItem(variantId, quantity)

      if (result.ok) {
        if (quantity === REMOVE) {
          notify({
            tone: 'warning',
            title: 'Товар убран из корзины',
            subject: productName,
            action: {
              label: 'Вернуть',
              onAction: () => {
                void restore(variantId)
              },
            },
          })
        }

        return
      }

      /*
        Причину показываем словами корзины, а не общим «не получилось»:
        закрытый сбор и снятый с продажи товар чинятся по-разному. Число на
        экране к этому моменту уже откатилось обратно (`rollbackOnError`), и
        без объяснения нажатие выглядит потерянным.
      */
      notify({
        tone: 'danger',
        title: quantity === REMOVE ? 'Товар не убран' : 'Количество не изменилось',
        description: result.error ?? 'Попробуйте ещё раз или обновите страницу',
      })
    },
    [variantId, updateItem, removeItem, notify, productName, restore]
  )

  if (line === undefined) {
    return <QuantityStepper value={ONE} onChange={() => undefined} disabled={true} label={label} />
  }

  return (
    <QuantityStepper
      value={line.quantity}
      onChange={quantity => void change(quantity)}
      min={REMOVE}
      label={label}
      decreaseLabel={
        line.quantity === ONE ? `Убрать из корзины: ${productName}` : 'Уменьшить количество'
      }
    />
  )
}
