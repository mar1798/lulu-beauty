import useSWR from 'swr'
import type { IOrderCycle } from 'widgets/types'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { activeCycleKey } from '@/services/swrKeys'

/**
 * Текущий сбор заказов — общий для всех, кому нужно знать, открыт ли приём.
 *
 * Ключ один на приложение (`activeCycleKey`), поэтому сетка каталога из
 * двадцати карточек делает **один** запрос: SWR склеивает их по ключу. Ручка
 * публичная, гостю тоже отвечает — состояние витрины не зависит от того, вошёл
 * человек или нет.
 *
 * `null` в `cycle` — штатное состояние («сбора нет»), а не сбой: `GET
 * /cycles/active` отдаёт на него 404, и `getActiveCycleOrNull` его сворачивает.
 *
 * Зачем это кнопке «в корзину»: `POST /cart/items` в этом состоянии отвечает
 * 409 `no_active_cycle`, и узнать об этом **до** нажатия лучше, чем после.
 * Гонку это не отменяет — сбор может закрыться между рендером и кликом, —
 * поэтому обработка 409 в `CartContext` остаётся на месте.
 */
export interface IActiveCycleState {
  cycle: IOrderCycle | null
  /** Ответа ещё нет ни в кеше, ни из статики: «сбора нет» показывать рано. */
  isLoading: boolean
  /**
   * Точно известно, что открытого сбора нет. Именно по этому флагу гасятся
   * кнопки: `cycle === null` само по себе значит ещё и «не знаем».
   */
  isClosed: boolean
}

export const useActiveCycle = (): IActiveCycleState => {
  const { data, error } = useSWR(activeCycleKey, () => getActiveCycleOrNull())

  /*
    «Ответ есть» — это `data !== undefined`, а не `!isLoading`. Значение из
    `fallback` (см. `services/swrFallback.ts`) лежит в кеше с первого кадра, но
    SWR всё равно считает первую фоновую проверку загрузкой — и по `isLoading`
    витрина ждала бы её впустую, в том числе на сервере, где никакой проверки
    не будет вовсе: врезка «приём заказов закрыт» не попадала бы в статику.

    `null` здесь — полноценный ответ («сбора нет»), а не пустота: его даёт
    `getActiveCycleOrNull`, сворачивая штатный 404.
  */
  const isAnswered = data !== undefined
  const cycle = data ?? null

  return {
    cycle,
    isLoading: !isAnswered,
    /*
      Осечка запроса — не повод объявлять приём закрытым: гасить кнопки из-за
      отвалившейся сети значит показать неправду. Пусть лучше человек нажмёт и
      получит честный ответ сервера.
    */
    isClosed: isAnswered && error === undefined && cycle === null,
  }
}
