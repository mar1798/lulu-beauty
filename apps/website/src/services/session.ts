/**
 * Сигнал «сессии больше нет» — от HTTP-клиента к состоянию авторизации.
 *
 * 401 от бэкенда через прокси означает ровно одно: ни access, ни refresh уже не
 * годятся (прокси сам пробует обновить пару и стирает cookie, только когда и
 * повтор отвергнут, — см. `server/apiFetch.ts`). Интерфейс при этом продолжал
 * показывать вошедшего: профиль лежит в кеше SWR, и перечитывается он лишь по
 * событию. Отсюда и посредник — `services/api.ts` не должен знать ни про
 * контекст авторизации, ни про роутер, а `AuthContext` не должен разбирать
 * каждый ответ.
 */

type SessionExpiredHandler = () => void

const handlers = new Set<SessionExpiredHandler>()

/** Подписка; возвращает отписку — ровно то, что ждёт `useEffect`. */
export const onSessionExpired = (handler: SessionExpiredHandler): (() => void) => {
  handlers.add(handler)

  return (): void => {
    handlers.delete(handler)
  }
}

/**
 * Копия набора: обработчик вправе отписаться прямо по сигналу, а изменение
 * `Set` во время обхода теряет соседей.
 */
export const notifySessionExpired = (): void => {
  for (const handler of [...handlers]) {
    handler()
  }
}
