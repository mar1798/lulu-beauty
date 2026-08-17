import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { mutate as globalMutate } from 'swr'
import { Alert, Button } from 'widgets/atoms'
import { useToast } from 'widgets/contexts'
import { orderNumber } from 'widgets/molecules'
import { useCart } from '@/contexts/CartContext'
import { useEditableOrder } from '@/hooks/useEditableOrder'
import { messageForError } from '@/services/apiErrors'
import { addMyOrderItem } from '@/services/endpoints/orders'
import { isOrdersKey } from '@/services/swrKeys'

/**
 * Врезка «у вас уже есть открытая заявка» — на корзине и на оформлении.
 *
 * Вторая заявка на тот же сбор ничем не запрещена, но владельцу она приходит
 * отдельной строкой, и сводить их приходится руками. Пока сбор открыт, товар
 * добавляется прямо в поданную заявку (`POST /orders/{id}/items`) — это и
 * делает кнопка врезки: переносит в заявку всю корзину и уводит на неё.
 *
 * Пока ответа про заявки нет, не рисуется ничего: врезка, мигнувшая на долю
 * секунды, хуже её отсутствия (см. `ClosedCycleNotice`).
 */
export const EditableOrderNotice: React.FC = () => {
  const order = useEditableOrder()
  const router = useRouter()
  const { cart, removeItem } = useCart()
  const { notify } = useToast()
  const [isMoving, setIsMoving] = useState(false)

  if (order === null) {
    return null
  }

  const number = orderNumber(order.id)
  const items = cart?.items ?? []

  /**
   * Перенос корзины в заявку.
   *
   * Позиция убирается из корзины сразу после того, как заявка её приняла, а не
   * все разом в конце: оборвись сеть на середине, в корзине останется ровно
   * то, что перенести не успели, — и кнопку можно нажать ещё раз. Общая
   * очистка в этом месте либо потеряла бы неперенесённое, либо оставила бы
   * дубли.
   *
   * Последовательно, а не `Promise.all`: заявку меняет каждый запрос, и
   * параллельные добавления гонялись бы за один и тот же снимок состава.
   */
  const move = async (): Promise<void> => {
    if (items.length === 0) {
      await router.push(`/orders/${order.id}`)

      return
    }

    setIsMoving(true)

    try {
      for (const item of items) {
        await addMyOrderItem(order.id, item.productId, item.quantity)

        const result = await removeItem(item.productId)

        /*
          Товар в заявке уже есть, а из корзины не убрался: продолжать нельзя —
          следующий проход добавил бы его в заявку второй раз. Ошибку корзина
          уже перевела на человеческий, поэтому она идёт как есть.
        */
        if (!result.ok) {
          notify({
            tone: 'danger',
            title: 'Перенесено не всё',
            description: result.error ?? 'Товар добавлен в заявку, но остался в корзине.',
          })

          return
        }
      }

      notify({
        tone: 'success',
        title: `Товары перенесены в заявку ${number}`,
        description: 'Владелец получит одну заявку вместо двух.',
      })
      await router.push(`/orders/${order.id}`)
    } catch (cause: unknown) {
      notify({
        tone: 'danger',
        title: 'Перенести не получилось',
        description: messageForError(cause, 'order.item.add'),
      })
    } finally {
      /*
        Перечитываем в любом исходе, в том числе после осечки на середине:
        часть позиций заявка к этому моменту уже приняла, и список её состав
        должен показывать новым.
      */
      await globalMutate(isOrdersKey)
      setIsMoving(false)
    }
  }

  return (
    <Alert
      tone="info"
      title={`Заявка ${number} ждёт подтверждения`}
      action={
        <Button
          size="sm"
          variant="secondary"
          isLoading={isMoving}
          onClick={() => {
            void move()
          }}
        >
          {items.length === 0 ? `Открыть заявку ${number}` : `Добавить в заявку ${number}`}
        </Button>
      }
    >
      Пока сбор открыт, товары можно добавить прямо в неё — тогда владелец получит одну
      заявку вместо двух. Эта корзина уйдёт отдельной заявкой, если оформить её.
    </Alert>
  )
}
