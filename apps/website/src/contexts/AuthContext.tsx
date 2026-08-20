import React, { createContext, useCallback, useContext, useMemo } from 'react'
import useSWR from 'swr'
import type { IAuthUser } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import { meKey } from '@/services/swrKeys'
import {
  getMe,
  logout as logoutRequest,
  pollTelegramLogin as pollTelegramLoginRequest,
  signInWithMiniApp as signInWithMiniAppRequest,
  signInWithTelegramWidget as signInWithTelegramWidgetRequest,
  startTelegramLogin as startTelegramLoginRequest,
  updateProfile as updateProfileRequest,
  type ITelegramLoginSession,
} from '@/services/endpoints/auth'

/**
 * Состояние авторизации на клиенте. Токенов здесь нет и быть не может —
 * они лежат в httpOnly-cookie; единственный способ узнать, кто мы, —
 * спросить у `/api/auth/me`.
 *
 * Входа «по данным» здесь нет: `startTelegramLogin` открывает сессию, а
 * `pollTelegramLogin` спрашивает, подтвердил ли её бот. Пока не подтвердил —
 * это не ошибка, а `status: 'PENDING'`.
 */

export interface IAuthContextValue {
  user: IAuthUser | null
  /** true, пока не завершилась первая проверка сессии — до этого не редиректим. */
  isLoading: boolean
  isAdmin: boolean
  /** Открывает вход и отдаёт ссылку на бота. */
  startTelegramLogin: () => Promise<ITelegramLoginSession>
  /** Один опрос: `null` — ещё ждём, профиль — вошли. */
  pollTelegramLogin: () => Promise<IAuthUser | null>
  /**
   * Вход по подписи Telegram — из Mini App и из виджета на странице входа.
   *
   * Ожидания здесь нет вовсе: подпись либо сходится, либо нет, а «нет» приезжает
   * исключением с кодом (`telegram_account_not_linked` — единственный поправимый).
   */
  signInWithMiniApp: (initData: string) => Promise<IAuthUser | null>
  signInWithTelegramWidget: (payload: Record<string, unknown>) => Promise<IAuthUser | null>
  updateProfile: (name: string) => Promise<IAuthUser>
  logout: () => Promise<void>
  /** Перечитывает сессию и отдаёт её результат — ждать лишнего рендера не нужно. */
  reload: () => Promise<IAuthUser | null>
}

const AuthContext = createContext<IAuthContextValue | null>(null)

const UNAUTHORIZED = 401

/** 401 от `/api/auth/me` — это «гость», а не сбой: наверх он не поднимается. */
const loadUser = async (): Promise<IAuthUser | null> => {
  try {
    return await getMe()
  } catch (error) {
    if (isApiError(error) && error.status === UNAUTHORIZED) {
      return null
    }

    throw error
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, isLoading, mutate } = useSWR<IAuthUser | null>(meKey, loadUser)
  const user = data ?? null

  const reload = useCallback(async (): Promise<IAuthUser | null> => (await mutate()) ?? null, [
    mutate,
  ])

  const startTelegramLogin = useCallback(() => startTelegramLoginRequest(), [])

  const pollTelegramLogin = useCallback(async (): Promise<IAuthUser | null> => {
    const result = await pollTelegramLoginRequest()

    if (result.status !== 'AUTHORIZED') {
      return null
    }

    /*
      Профиль приходит вместе с подтверждением, и кеш заполняется им сразу:
      иначе между «вошли» и первым ответом `/api/auth/me` экран успевает
      мигнуть гостевым состоянием — с редиректом на этот же вход включительно.
      Если профиль не дочитался, перезапрашиваем — cookie уже стоят.
    */
    if (result.user == null) {
      return await reload()
    }

    await mutate(result.user, { revalidate: false })

    return result.user
  }, [mutate, reload])

  /**
   * Общий хвост обоих входов по подписи: профиль приходит вместе с ответом и сразу
   * ложится в кеш — иначе экран успевает мигнуть гостевым состоянием, а в Mini App это
   * мигание выглядит как «магазин выкинул меня на вход».
   */
  const acceptSignIn = useCallback(
    async (signedIn: IAuthUser | null): Promise<IAuthUser | null> => {
      if (signedIn === null) {
        // Cookie уже стоят — профиль достаточно перезапросить.
        return await reload()
      }

      await mutate(signedIn, { revalidate: false })

      return signedIn
    },
    [mutate, reload]
  )

  const signInWithMiniApp = useCallback(
    async (initData: string): Promise<IAuthUser | null> =>
      await acceptSignIn((await signInWithMiniAppRequest(initData)).user),
    [acceptSignIn]
  )

  const signInWithTelegramWidget = useCallback(
    async (payload: Record<string, unknown>): Promise<IAuthUser | null> =>
      await acceptSignIn((await signInWithTelegramWidgetRequest(payload)).user),
    [acceptSignIn]
  )

  const updateProfile = useCallback(
    async (name: string): Promise<IAuthUser> => {
      const updated = await updateProfileRequest(name)

      await mutate(updated, { revalidate: false })

      return updated
    },
    [mutate]
  )

  const logout = useCallback(async (): Promise<void> => {
    // Кэш сессии сбрасывается только после успешного выхода. В `finally` он
    // сбрасывался всегда — и на упавшем запросе интерфейс показывал гостя, тогда
    // как cookie оставались на месте: перезагрузка возвращала сессию, а человек
    // считал, что вышел.
    await logoutRequest()
    await mutate(null, { revalidate: false })
  }, [mutate])

  const value = useMemo<IAuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'ADMIN',
      startTelegramLogin,
      pollTelegramLogin,
      signInWithMiniApp,
      signInWithTelegramWidget,
      updateProfile,
      logout,
      reload,
    }),
    [
      user,
      isLoading,
      startTelegramLogin,
      pollTelegramLogin,
      signInWithMiniApp,
      signInWithTelegramWidget,
      updateProfile,
      logout,
      reload,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): IAuthContextValue => {
  const value = useContext(AuthContext)

  if (value === null) {
    throw new Error('useAuth вызван вне <AuthProvider>')
  }

  return value
}
