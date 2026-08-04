import type { IOrderCycle } from 'widgets/types'
import { api } from '../api'
import { isApiError } from '../apiErrors'

/** Текущий сбор заказов. Бросает `ApiError` с кодом `no_active_cycle`, когда сбора нет. */
export const getActiveCycle = (): Promise<IOrderCycle> => api.get('/cycles/active')

/**
 * То же, но «сбора нет» — это не ошибка, а нормальное состояние витрины
 * (шапка показывает «приём заказов закрыт»), поэтому 404 сворачивается в `null`.
 */
export const getActiveCycleOrNull = async (): Promise<IOrderCycle | null> => {
  try {
    return await getActiveCycle()
  } catch (error) {
    if (isApiError(error) && error.code === 'no_active_cycle') {
      return null
    }

    throw error
  }
}
