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
 * корзина на сервере догонит экран (оптимистичные правки уходят очередью): ждёт и перепроверка,
 * и сам `apply`, а правка корзины во время его ожидания или проверки не отменяет его, а
 * повторяет проверку по новому составу.
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

/** Исход проверки: принят, отказан сервером или вытеснен более новой проверкой. */
type CheckOutcome =
  { kind: 'ok'; result: IPromoCodeCheck } | { kind: 'refused' } | { kind: 'stale' }

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
  /**
   * Последнее намерение: правка состава, «Применить» или «Убрать». Перепроверка, которая
   * ждёт корзину, после ожидания проверяет, что оно не сменилось: иначе она вернула бы
   * снятый код или вытеснила бы выбранный человеком.
   */
  const intent = useRef(0)
  /** Выбор человека: «Применить» или «Убрать». Правка состава его не меняет. */
  const choice = useRef(0)
  /** Счётчик правок состава корзины: `apply` по нему понимает, что ответ устарел. */
  const cartVersion = useRef(0)
  /** Выбор, чей `apply` ещё идёт (0 - никакой): перепроверка принятого кода ему не мешает. */
  const pending = useRef(0)
  const waitRef = useRef(waitForCart)

  useEffect(() => {
    waitRef.current = waitForCart
  }, [waitForCart])

  const check = useCallback(async (code: string): Promise<CheckOutcome> => {
    const current = attempt.current + 1

    attempt.current = current
    setIsChecking(true)
    setError(null)

    try {
      const result = await checkPromoCode(code)

      return current === attempt.current ? { kind: 'ok', result } : { kind: 'stale' }
    } catch (cause: unknown) {
      if (current === attempt.current) {
        setError(messageForError(cause, 'promoCode.check'))
      }

      return current === attempt.current ? { kind: 'refused' } : { kind: 'stale' }
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
      intent.current += 1
      choice.current += 1

      const mine = choice.current

      pending.current = mine

      try {
        // Сперва корзина на сервере догоняет экран, иначе код проверится по составу до «+».
        // Правка корзины во время ожидания или проверки не отменяет выбор: ждём и проверяем
        // заново, уже по новому составу. Отменить его могут только «Убрать» и другой код.
        for (;;) {
          const version = cartVersion.current

          await waitRef.current()

          if (choice.current !== mine) {
            return
          }

          if (cartVersion.current !== version) {
            continue
          }

          const outcome = await check(normalized)

          if (choice.current !== mine || outcome.kind === 'stale') {
            return
          }

          if (cartVersion.current !== version) {
            continue
          }

          if (outcome.kind === 'ok') {
            setApplied(outcome.result)
            setValue('')
          }

          return
        }
      } finally {
        if (pending.current === mine) {
          pending.current = 0
        }
      }
    },
    [check, value]
  )

  const remove = useCallback((): void => {
    attempt.current += 1
    intent.current += 1
    choice.current += 1
    pending.current = 0
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
    // Каждая правка состава - новое намерение: живой остаётся только последняя перепроверка.
    intent.current += 1
    cartVersion.current += 1

    // Нет принятого кода или идёт «Применить»: он сам дождётся корзины и проверит по новому составу.
    if (code === null || pending.current !== 0) {
      return
    }

    const mine = intent.current

    void (async (): Promise<void> => {
      await waitRef.current()

      // За время ожидания код сняли, ввели другой или состав изменился ещё раз.
      if (intent.current !== mine) {
        return
      }

      const outcome = await check(code)

      // Отказ (`error` уже записан) снимает код: условия перестали выполняться.
      // Вытесненная проверка ничего не решает: актуальный ответ придёт от более новой.
      if (outcome.kind === 'ok') {
        setApplied(outcome.result)
      } else if (outcome.kind === 'refused') {
        setApplied(null)
      }
    })()
  }, [signature, code, check])

  return { value, setValue, applied, isChecking, error, apply, remove }
}
