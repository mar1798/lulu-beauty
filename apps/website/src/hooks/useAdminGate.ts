import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Гейт админки на клиенте.
 *
 * Раньше `/admin/*` закрывался в `getServerSideProps`, и это стоило перехода:
 * SSR-страницы Next не префетчит, поэтому каждый клик по разделу держал
 * владельца на прошлом экране весь round-trip до сервера и запрос к API
 * «кто я». Теперь страницы раздела статические — они приезжают заранее и
 * открываются мгновенно, а право входа проверяется здесь.
 *
 * Данные это не открывает: каждая админская ручка бэкенда и так требует роль
 * ADMIN, и без неё страница получила бы только 403. Единственное, что нужно
 * сохранить, — чтобы покупатель не увидел каркас чужого раздела: пока сессия
 * не проверена, `AdminShell` не рисует ни навигацию, ни содержимое.
 *
 * При переходе внутри сайта сессия уже лежит в кеше SWR, поэтому `checking`
 * длится ровно один рендер — заминка бывает только на прямом заходе по адресу.
 */

export type IAdminAccess = 'checking' | 'granted' | 'denied'

const LOGIN_PATH = '/login'
const CUSTOMER_FALLBACK = '/catalog'

export const useAdminGate = (): IAdminAccess => {
  const router = useRouter()
  const { user, isAdmin, isLoading } = useAuth()

  const access: IAdminAccess = isLoading ? 'checking' : isAdmin ? 'granted' : 'denied'

  useEffect(() => {
    if (access !== 'denied') {
      return
    }

    /*
      Гость уходит на вход с адресом возврата, покупатель — в каталог:
      сообщать ему, что такой раздел существует, незачем. `replace`, а не
      `push`: «назад» из каталога должно вести на страницу до админки, а не
      обратно в редирект.
    */
    const destination =
      user === null
        ? `${LOGIN_PATH}?next=${encodeURIComponent(router.asPath)}`
        : CUSTOMER_FALLBACK

    void router.replace(destination)
  }, [access, user, router])

  return access
}
