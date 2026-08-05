import { useEffect, useRef, useState } from 'react'
import { isApiError } from '@/services/apiErrors'

/**
 * Одноразовая загрузка приватных данных (заявки, профиль).
 *
 * Ключ свежести — строка `key`, а не тождество загрузчика: в неё страница
 * складывает всё, от чего данные зависят (идентификатор пользователя, id
 * заявки, фильтры списка). Смена ключа перечитывает данные, ответ на прошлый
 * ключ уже не признаётся свежим — ни смену аккаунта, ни переход между
 * заявками он не переживёт.
 *
 * **Почему не тождество функции, как было раньше.** Прежняя версия сравнивала
 * загрузчик из состояния с загрузчиком этого рендера. У такого правила есть
 * отказ, при котором экран навсегда остаётся на скелетонах: стоит идентичности
 * загрузчика меняться на каждом рендере — незамемоизированная функция,
 * нестабильная зависимость `useMemo`, сброшенный кеш хуков после Fast Refresh —
 * и ответ никогда не признаётся свежим, а сам ответ вызывает следующий рендер
 * с новой идентичностью и новым запросом. Со стороны это выглядит ровно так:
 * запросы уходят, возвращаются `200`, а на экране ничего не меняется. Со
 * строковым ключом идентичность загрузчика ни на что не влияет: он читается
 * из ref, в зависимостях эффекта его нет, и петля невозможна в принципе.
 *
 * `null` вместо загрузчика — «грузить нечего»: гость или ещё не разобранный
 * маршрут.
 *
 * Второй ключ — `reloadToken`: экраны админки после каждой мутации обязаны
 * перечитать данные, а `key` при этом не меняется.
 *
 * Библиотеку кеширования не тянем сознательно (см. §2.5 плана): приватных
 * экранов мало, публичные данные приходят из ISR.
 */

type ILoader<T> = () => Promise<T>

interface ISettled<T> {
  key: string
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
  /** Всё, от чего зависят данные, одной строкой: `orders:${userId}`. */
  key: string,
  load: ILoader<T> | null,
  fallbackMessage: string,
  /** Увеличьте после мутации, чтобы перечитать данные тем же ключом. */
  reloadToken = 0
): IRequestState<T> => {
  const [settled, setSettled] = useState<ISettled<T> | null>(null)

  /*
    Загрузчик — через ref, и обновляется отдельным эффектом до загружающего:
    эффекты срабатывают в порядке объявления, поэтому к моменту запроса в ref
    лежит загрузчик текущего рендера. Присваивание прямо в теле рендера было
    бы записью во время рендера, а зависимость от `load` вернула бы петлю.
  */
  const loaderRef = useRef(load)

  useEffect(() => {
    loaderRef.current = load
  })

  /*
    Появление и исчезновение загрузчика — тоже повод перезапросить: гость,
    у которого закончилась проверка сессии, меняет `null` на настоящий
    загрузчик, а ключ при этом может не поменяться.
  */
  const hasLoader = load !== null

  useEffect(() => {
    const loader = loaderRef.current
    if (loader === null) {
      return
    }

    let isActive = true

    loader()
      .then(data => {
        if (isActive) {
          setSettled({ key, token: reloadToken, data, error: null, status: null })
        }
      })
      .catch((cause: unknown) => {
        if (isActive) {
          setSettled({
            key,
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
  }, [key, fallbackMessage, reloadToken, hasLoader])

  const isFresh = settled !== null && settled.key === key && settled.token === reloadToken

  return {
    data: isFresh ? settled.data : null,
    isLoading: load !== null && !isFresh,
    error: isFresh ? settled.error : null,
    status: isFresh ? settled.status : null,
  }
}
