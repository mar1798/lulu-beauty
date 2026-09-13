/**
 * Отложить работу до простоя браузера.
 *
 * `requestIdleCallback` есть не везде (Safari до 16.4) — там обычный таймаут:
 * он не ждёт простоя, но и не хуже того, что было бы без отсрочки вовсе.
 *
 * `timeout` — крайний срок, после которого браузер выполнит обработчик, даже
 * если простоя так и не случилось. Передавать его стоит только там, где работа
 * обязана случиться к определённому моменту: без срока обработчик ждёт
 * настоящего простоя и не отбирает время у страницы, которая ещё собирается.
 */
export const onIdle = (callback: () => void, timeout?: number): (() => void) => {
  const schedule = window.requestIdleCallback
  const cancel = window.cancelIdleCallback

  if (schedule === undefined || cancel === undefined) {
    const handle = window.setTimeout(callback, 1)

    return () => window.clearTimeout(handle)
  }

  const handle = timeout === undefined ? schedule(callback) : schedule(callback, { timeout })

  return () => cancel(handle)
}
