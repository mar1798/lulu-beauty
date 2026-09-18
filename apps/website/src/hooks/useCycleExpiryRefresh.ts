import { useEffect } from 'react'
import { useSWRConfig } from 'swr'
import { activeCycleKey } from '@/services/swrKeys'

/**
 * Перепроверка состояния сбора в тот момент, когда таймер добежал до нуля.
 *
 * Без неё страница на минуту-другую показывает три взаимоисключающих вещи:
 * таймер пишет «сбор закрыт», врезка `ClosedCycleNotice` молчит, а кнопки «в
 * корзину» остаются живыми. Виноват не таймер — он как раз прав: витрина
 * статическая с `revalidate: 60`, сбор закрывает планировщик API со своим
 * интервалом, и `cycle` в кеше всё это время ещё открыт.
 *
 * Проверка идёт по расписанию, а не по тику: дедлайн известен заранее, и
 * ждать его секундным опросом незачем. После дедлайна — несколько повторов:
 * планировщик закрывает сбор не в ту же секунду, и первый ответ обычно ещё
 * старый. Как только API отдаёт закрытый сбор, `deadlineAt` у вызывающего
 * становится `null`, эффект перезапускается и расписание умирает само.
 *
 * Вешать это внутрь `useActiveCycle` нельзя: хук стоит в каждой кнопке «в
 * корзину», и на витрине из двух десятков карточек получилось бы два десятка
 * одинаковых таймеров и столько же запросов. Место вызова — один на страницу,
 * рядом с таймером.
 */

/** Пауза между повторами, пока API ещё отдаёт сбор открытым. */
const RETRY_MS = 30_000

/**
 * Сколько раз повторить. Пять попыток — две с половиной минуты; дальше дело не
 * в задержке планировщика, а в том, что что-то сломано, и долбиться в ручку
 * бессмысленно.
 *
 * Подстраховки после этого нет: `revalidateOnFocus` выключен на всё
 * приложение (`_app.tsx`), а на страницах со статикой выключен и
 * `revalidateOnMount`, — до перезагрузки состояние сбора останется тем, каким
 * приехало. Заявку это не пропустит: `POST /cart/items` отвечает 409
 * `no_active_cycle` независимо от того, что показывает экран.
 */
const MAX_ATTEMPTS = 5

/** `setTimeout` считает задержку 32-битной: больше — и таймер сработает сразу. */
const MAX_DELAY = 2_147_483_647

export const useCycleExpiryRefresh = (deadlineAt: string | null): void => {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    const deadline = deadlineAt === null ? Number.NaN : Date.parse(deadlineAt)

    if (Number.isNaN(deadline)) {
      return undefined
    }

    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = (): void => {
      const left = deadline - Date.now()

      if (left > 0) {
        timer = setTimeout(check, Math.min(left, MAX_DELAY))
        return
      }

      attempts += 1
      void mutate(activeCycleKey)

      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(check, RETRY_MS)
      }
    }

    check()

    return () => {
      clearTimeout(timer)
    }
  }, [deadlineAt, mutate])
}
