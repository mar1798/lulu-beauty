import { useRouter } from 'next/router'

const LOGIN_PATH = '/login'

/**
 * Адрес входа с возвратом туда, откуда человек пришёл.
 *
 * Голый `/login` после входа уводил в каталог — а человек шёл оформлять заявку или
 * смотреть свою. `next` страница входа проверяет сама (`safeRedirectPath`).
 *
 * До готовности роутера `asPath` у динамической страницы — шаблон (`/orders/[id]`),
 * поэтому до тех пор отдаём вход без возврата: тот же адрес получится и на сервере, и
 * на первой отрисовке в браузере.
 */
export const useLoginHref = (): string => {
  const router = useRouter()

  if (!router.isReady || router.pathname === LOGIN_PATH) {
    return LOGIN_PATH
  }

  return `${LOGIN_PATH}?next=${encodeURIComponent(router.asPath)}`
}
