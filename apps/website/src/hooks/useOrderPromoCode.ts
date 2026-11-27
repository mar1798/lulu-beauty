import { useState } from 'react'
import type { IOrder } from 'widgets/types'
import { messageForError } from '@/services/apiErrors'
import { addMyOrderPromoCode } from '@/services/endpoints/orders'
import { normalizeCodeInput } from '@/hooks/usePromoCode'

/**
 * Промокод поданной заявки: ввод и применение.
 *
 * Правила те же, что на оформлении, но отдельной проверки нет: заявка уже есть, и код
 * применяется к ней сразу, как любая её правка (`POST /orders/{id}/promo-code`). Принятый
 * код хук не хранит - его показывает сама заявка (`order.promoCode`). Отказ остаётся под
 * полем: он про введённый код, а не про заявку.
 */

export interface IOrderPromoCodeState {
  value: string
  setValue: (value: string) => void
  isApplying: boolean
  error: string | null
  /** Применить введённый код или переданный (из списка «Ваши промокоды»). */
  apply: (code?: string) => Promise<void>
}

export interface IOrderPromoCodeHandlers {
  /** Код применён: ответ сервера - заявка целиком. */
  onApplied: (order: IOrder) => void | Promise<void>
  /** Отказ: заявка на экране могла разойтись с сервером, её перечитывают. */
  onRefused: () => unknown
}

export const useOrderPromoCode = (
  order: Pick<IOrder, 'id' | 'revision'> | undefined,
  { onApplied, onRefused }: IOrderPromoCodeHandlers
): IOrderPromoCodeState => {
  const [value, setInput] = useState('')
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setValue = (next: string): void => {
    setInput(next)
    setError(null)
  }

  const apply = async (code?: string): Promise<void> => {
    const normalized = normalizeCodeInput(code ?? value)

    if (order === undefined || normalized === '' || isApplying) {
      return
    }

    setValue(normalized)
    setIsApplying(true)

    try {
      const updated = await addMyOrderPromoCode(order.id, order.revision, normalized)

      setInput('')
      await onApplied(updated)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'order.promoCode.apply'))
      await onRefused()
    } finally {
      setIsApplying(false)
    }
  }

  return { value, setValue, isApplying, error, apply }
}
