import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import type { IAuthUser } from 'widgets/types'
import { UnauthenticatedError, fetchWithAuth } from './apiFetch'

/**
 * Гейт админки: `/admin/*` рендерится только владельцу и только на сервере.
 *
 * Это единственное исключение из SSG во всём сайте (см. §2.4 плана). Иначе
 * страница успела бы отрисоваться до того, как браузер спросит «кто я», и
 * покупатель на долю секунды увидел бы каркас чужого раздела — а на экранах
 * с товарами и заявками это не косметика.
 *
 * Гость уходит на вход с адресом возврата, покупатель — в каталог: сообщать
 * ему, что такой раздел существует, незачем.
 */

const LOGIN_PATH = '/login'
const CUSTOMER_FALLBACK = '/catalog'

export interface IAdminPageProps {
  user: IAuthUser
}

type IGateResult<P extends IAdminPageProps> =
  | { user: IAuthUser; redirect?: undefined }
  | { user?: undefined; redirect: GetServerSidePropsResult<P> }

const redirectTo = <P extends IAdminPageProps>(destination: string): IGateResult<P> => ({
  redirect: { redirect: { destination, permanent: false } },
})

/**
 * Возвращает либо профиль владельца, либо готовый результат
 * `getServerSideProps` с редиректом.
 */
export const requireAdmin = async <P extends IAdminPageProps>(
  context: GetServerSidePropsContext
): Promise<IGateResult<P>> => {
  const backTo = encodeURIComponent(context.resolvedUrl)

  let response: Response

  try {
    response = await fetchWithAuth(
      context.req,
      context.res,
      '/users/me',
      '',
      { method: 'GET' },
      { auth: 'required' }
    )
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return redirectTo(`${LOGIN_PATH}?next=${backTo}`)
    }

    throw error
  }

  if (!response.ok) {
    // 401 после неудачного обновления пары токенов — та же «не залогинен».
    return redirectTo(`${LOGIN_PATH}?next=${backTo}`)
  }

  const user = (await response.json()) as IAuthUser

  return user.role === 'ADMIN' ? { user } : redirectTo(CUSTOMER_FALLBACK)
}
