import { useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * Подтягивает чанки (и данные, если у страницы есть `getStaticProps`) для
 * списка маршрутов, пока браузер простаивает.
 *
 * Зачем это руками: в Next 16 (Pages Router) `next/link` больше не делает
 * префетч по попаданию ссылки в область экрана — только по наведению курсора.
 * Документация ещё описывает старое поведение, но замеры показывают именно
 * такое, и явный `prefetch={true}` его не возвращает. На тач-устройствах
 * наведения нет вовсе, а на десктопе между hover и кликом слишком мало
 * времени, чтобы префетч успел завершиться, — переход платит за загрузку
 * чанка целиком.
 */

/**
 * Уже запрошенные маршруты — на весь сеанс, а не на монтирование.
 *
 * Каркас страницы монтируется заново на каждом переходе, а объект роутера
 * меняет ссылку и внутри одной страницы; без этого набора один и тот же чанк
 * запрашивался бы повторно после каждой навигации.
 */
const requested = new Set<string>()

export const usePrefetchRoutes = (routes: readonly string[]): void => {
  const router = useRouter()

  /*
   * Роутер в зависимостях безобиден: объект меняет ссылку на каждом переходе,
   * но повторный проход упирается в `requested` и выходит, ничего не запросив.
   */
  useEffect(() => {
    // В dev `prefetch` заставил бы dev-сервер компилировать все маршруты сразу,
    // конкурируя с текущей страницей, — выигрыш там сомнительный.
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const pending = routes.filter(route => !requested.has(route))

    if (pending.length === 0) {
      return
    }

    /*
     * Отмечаем сразу, а не в самом обработчике простоя: пока тот ждёт своей
     * очереди, эффект успевает пройти второй раз (список маршрутов меняется,
     * когда доезжает ответ `/api/auth/me`) и запланировать ровно то же самое.
     */
    pending.forEach(route => requested.add(route))

    // `requestIdleCallback` есть не везде (Safari до 16.4) — там просто таймаут.
    const schedule =
      window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout

    let started = false

    const handle = schedule(() => {
      started = true

      for (const route of pending) {
        // Отказ префетча — не ошибка страницы: маршрут просто останется холодным.
        void router.prefetch(route).catch(() => requested.delete(route))
      }
    })

    return () => {
      cancel(handle as number)

      // Не успели до размонтирования — снимаем отметку, иначе маршрут
      // останется «запрошенным», ни разу не будучи запрошенным.
      if (!started) {
        pending.forEach(route => requested.delete(route))
      }
    }
  }, [router, routes])
}
