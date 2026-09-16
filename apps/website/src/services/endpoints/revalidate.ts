import { nextApi } from '../api'

/**
 * Ревалидация публичных страниц после правки в админке.
 *
 * Адресат — не бэкенд, а собственная ручка Next (`pages/api/revalidate.ts`):
 * пересобрать статику может только тот сервер, который её отдаёт. Про то,
 * зачем это вообще нужно, написано там же.
 */

export interface IRevalidateResult {
  revalidated: string[]
  /** Адреса, которые пересобрать не удалось, — например ещё не сгенерированный товар. */
  failed: string[]
}

/** Главная и каталог: их меняет любая правка товара, категории или сбора. */
export const SHOWCASE_PATHS = ['/', '/catalog'] as const

export const productPath = (slug: string): string => `/catalog/${slug}`

const requestRevalidate = (paths: string[]): Promise<IRevalidateResult> =>
  nextApi.post('/revalidate', { body: { paths } })

/**
 * Попросить пересобрать страницы и забыть.
 *
 * Намеренно ничего не возвращает и никогда не бросает: сохранение уже прошло,
 * и падать тостом из-за витрины, которая и сама протухнет через минуту, значит
 * сообщать об ошибке там, где её нет. Осечка остаётся в консоли.
 */
export const refreshPublicPages = (...paths: (string | undefined | null)[]): void => {
  const wanted = paths.filter((path): path is string => typeof path === 'string' && path !== '')

  if (wanted.length === 0) {
    return
  }

  void requestRevalidate(wanted)
    .then(result => {
      if (result.failed.length > 0) {
        console.warn('Не пересобрались страницы:', result.failed.join(', '))
      }
    })
    .catch((cause: unknown) => {
      console.warn('Не удалось пересобрать публичные страницы', cause)
    })
}
