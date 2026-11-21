import { useCallback, useEffect, useRef, useState } from 'react'
import type { IPromoCodeCheck } from 'widgets/types'
import { messageForError } from '@/services/apiErrors'
import { checkPromoCode } from '@/services/endpoints/cart'

/**
 * Промокод на оформлении: ввод, проверка сервером и перепроверка при правке корзины.
 *
 * Хук ничего не считает - скидку, подарки и «к оплате» отдаёт `POST /cart/promo-code/check`,
 * и принятый ответ хранится целиком (`applied`). Код резервируется не здесь, а самим
 * оформлением: до отправки заявки он только проверен.
 *
 * Условия кода зависят от состава корзины (порог суммы, штук, нужный товар), поэтому
 * при её изменении принятый код проверяется заново, не дожидаясь отправки: иначе человек
 * видел бы скидку, которую заявка уже не даст, и узнавал об этом отказом оформления.
 * Не прошёл - код снимается, а причина остаётся в `error`. `signature` - любая строка,
 * меняющаяся вместе с составом (объёмы и количества); `waitForCart` - ожидание, пока
 * корзина на сервере догонит экран (оптимистичные правки уходят очередью).
 */

export interface IPromoCodeState {
  value: string
  setValue: (value: string) => void
  /** Принятый сервером код с суммами; `null` - кода нет. */
  applied: IPromoCodeCheck | null
  isChecking: boolean
  error: string | null
  /** Проверить введённый код или переданный (из списка «Ваши промокоды»). */
  apply: (code?: string) => Promise<void>
  remove: () => void
}

/** Регистр и края не важны человеку - и серверу, но показываем код так, как его выдали. */
export const normalizeCodeInput = (value: string): string => value.trim().toUpperCase()

export const usePromoCode = (
  signature: string,
  waitForCart: () => Promise<void>
): IPromoCodeState => {
  const [value, setValue] = useState('')
  const [applied, setApplied] = useState<IPromoCodeCheck | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Номер последней проверки: ответ запоздавшей перекрывать новую не должен. */
  const attempt = useRef(0)
  const waitRef = useRef(waitForCart)

  useEffect(() => {
    waitRef.current = waitForCart
  }, [waitForCart])

  const check = useCallback(async (code: string): Promise<IPromoCodeCheck | null> => {
    const current = attempt.current + 1

    attempt.current = current
    setIsChecking(true)
    setError(null)

    try {
      const result = await checkPromoCode(code)

      return current === attempt.current ? result : null
    } catch (cause: unknown) {
      if (current === attempt.current) {
        setError(messageForError(cause, 'promoCode.check'))
      }

      return null
    } finally {
      if (current === attempt.current) {
        setIsChecking(false)
      }
    }
  }, [])

  const apply = useCallback(
    async (code?: string): Promise<void> => {
      const normalized = normalizeCodeInput(code ?? value)

      if (normalized === '') {
        return
      }

      setValue(normalized)

      const result = await check(normalized)

      if (result !== null) {
        setApplied(result)
        setValue('')
      }
    },
    [check, value]
  )

  const remove = useCallback((): void => {
    attempt.current += 1
    setApplied(null)
    setError(null)
    setIsChecking(false)
  }, [])

  /*
    Перепроверка при смене состава. Код берётся из `applied` в момент срабатывания, а
    не из замыкания: эффект запускается только от `signature`, и лишних проверок
    от смены самого ответа быть не должно.
  */
  const code = applied?.code.code ?? null
  const lastSignature = useRef(signature)

  useEffect(() => {
    if (lastSignature.current === signature) {
      return
    }

    lastSignature.current = signature

    if (code === null) {
      return
    }

    void (async (): Promise<void> => {
      await waitRef.current()

      const result = await check(code)

      // Отказ (`error` уже записан) снимает код: условия перестали выполняться.
      setApplied(result)
    })()
  }, [signature, code, check])

  return { value, setValue, applied, isChecking, error, apply, remove }
}
