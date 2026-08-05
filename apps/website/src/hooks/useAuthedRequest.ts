import { useEffect, useState } from 'react'
import { isApiError } from '@/services/apiErrors'

/**
 * Одноразовая загрузка приватных данных (заявки, профиль).
 *
 * Ключом свежести служит сам загрузчик: страница обязана обернуть его в
 * `useMemo`/`useCallback` с зависимостями от того, что данные определяет
 * (идентификатор пользователя, id заявки). Тогда ответ на прошлый запрос
 * не переживёт ни смену аккаунта, ни переход между заявками — состояние
 * с чужим `source` просто считается несвежим.
 *
 * `null` вместо загрузчика — «грузить нечего»: гость или ещё не разобранный
 * маршрут. Ни setState в теле эффекта, ни отдельного «смонтировано» здесь
 * нет — иначе линтер (`react-hooks/set-state-in-effect`) справедливо ругается.
 *
 * Второй ключ — `reloadToken`: экраны админки после каждой мутации обязаны
 * перечитать данные, а сам загрузчик при этом не меняется. Подмешивать
 * счётчик в зависимости `useMemo` было бы враньём — он там не используется,
 * и линтер это справедливо замечает.
 *
 * Библиотеку кеширования не тянем сознательно (см. §2.5 плана): приватных
 * экранов мало, публичные данные приходят из ISR.
 */

type ILoader<T> = () => Promise<T>

interface ILoaded<T> {
  source: ILoader<T>
  token: number
  data: T | null
  error: string | null
  /** HTTP-статус ошибки: страница заявки отличает 404 от «всё сломалось». */
  status: number | null
}

export interface IRequestState<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  status: number | null
}

export const useAuthedRequest = <T,>(
  load: ILoader<T> | null,
  fallbackMessage: string,
  /** Увеличьте после мутации, чтобы перечитать данные тем же загрузчиком. */
  reloadToken = 0
): IRequestState<T> => {
  const [loaded, setLoaded] = useState<ILoaded<T> | null>(null)

  useEffect(() => {
    if (load === null) {
      return
    }

    let isActive = true

    load()
      .then(data => {
        if (isActive) {
          setLoaded({ source: load, token: reloadToken, data, error: null, status: null })
        }
      })
      .catch((cause: unknown) => {
        if (isActive) {
          setLoaded({
            source: load,
            token: reloadToken,
            data: null,
            error: isApiError(cause) ? cause.message : fallbackMessage,
            status: isApiError(cause) ? cause.status : null,
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [load, fallbackMessage, reloadToken])

  const isFresh = loaded !== null && loaded.source === load && loaded.token === reloadToken

  return {
    data: isFresh ? loaded.data : null,
    isLoading: load !== null && !isFresh,
    error: isFresh ? loaded.error : null,
    status: isFresh ? loaded.status : null,
  }
}
