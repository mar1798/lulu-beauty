import { useCallback, useRef } from 'react'
import type { KeyedMutator } from 'swr'
import type { IAdminChecklist } from 'widgets/types'
import { clearChecklistMarks, setChecklistMark } from '@/services/endpoints/admin'

/**
 * Отметки «куплено» в чек-листе закупки — на сервере, общие для всех админов:
 * двое делят магазин пополам, и купленное одним другой должен видеть
 * купленным. Сами ключи приходят в ответе `GET /admin/checklist`
 * (`checkedKeys`), так что отметки и список читаются одним запросом.
 *
 * Нажатие красит строку сразу (оптимистично), не дожидаясь сервера: в
 * магазине связь бывает плохой, а отметку ставят на ходу. Не дошла — ошибка
 * уходит наверх, а экран выправляет перечитанный список.
 *
 * Несколько отметок подряд, пока предыдущие ещё в пути, — обычное дело, и
 * SWR тут сам не справляется: ответ, к приходу которого началась следующая
 * мутация, он отбрасывает (ни кеша, ни отката), а `revalidate` между
 * мутациями тоже игнорирует. Поэтому каждая оптимистичная правка строится от
 * того, что на экране, а когда завершается последняя из запросов в пути,
 * список перечитывается один раз — и экран сходится с сервером, что бы ни
 * случилось по дороге: сорвавшаяся отметка, «Снять отметки», обогнавшие
 * отметку, чужие отметки.
 */

export interface IChecklistMarks {
  checkedKeys: string[]
  toggle: (key: string, checked: boolean) => Promise<void>
  reset: () => Promise<void>
}

const withKey = (keys: string[], key: string, checked: boolean): string[] => {
  const rest = keys.filter(existing => existing !== key)

  return checked ? [...rest, key] : rest
}

export const useChecklistMarks = (
  data: IAdminChecklist | undefined,
  mutate: KeyedMutator<IAdminChecklist>
): IChecklistMarks => {
  /** Сколько запросов отметок сейчас в пути. */
  const inFlight = useRef(0)

  const apply = useCallback(
    async (
      buildRequest: (cycleId: string) => Promise<void>,
      next: (keys: string[]) => string[]
    ): Promise<void> => {
      const cycleId = data?.cycle?.id

      if (data === undefined || cycleId === undefined) {
        return
      }

      inFlight.current += 1

      try {
        await mutate(
          buildRequest(cycleId).then(() => undefined),
          {
            /*
              От показанного (`displayed`), а не от первого аргумента: тот —
              последнее подтверждённое значение, без отметок, которые ещё в
              пути, и вторая отметка подряд гасила бы первую.
            */
            optimisticData: (_committed, displayed) => {
              const base = displayed ?? data

              return { ...base, checkedKeys: next(base.checkedKeys) }
            },
            populateCache: false,
            revalidate: false,
            rollbackOnError: true,
          }
        )
      } finally {
        inFlight.current -= 1

        if (inFlight.current === 0) {
          void mutate()
        }
      }
    },
    [data, mutate]
  )

  const toggle = useCallback(
    (key: string, checked: boolean): Promise<void> =>
      apply(
        cycleId => setChecklistMark(cycleId, key, checked),
        keys => withKey(keys, key, checked)
      ),
    [apply]
  )

  const reset = useCallback((): Promise<void> => apply(clearChecklistMarks, () => []), [apply])

  return { checkedKeys: data?.checkedKeys ?? [], toggle, reset }
}
