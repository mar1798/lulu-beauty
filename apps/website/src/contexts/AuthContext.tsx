import React, { createContext, useCallback, useContext, useMemo } from 'react'
import useSWR from 'swr'
import type { IAuthUser } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import { meKey } from '@/services/swrKeys'
import {
  getMe,
  logout as logoutRequest,
  pollTelegramLogin as pollTelegramLoginRequest,
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

  const updateProfile = useCallback(
    async (name: string): Promise<IAuthUser> => {
      const updated = await updateProfileRequest(name)

      await mutate(updated, { revalidate: false })

      return updated
    },
    [mutate]
  )

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest()
    } finally {
      await mutate(null, { revalidate: false })
    }
  }, [mutate])

  const value = useMemo<IAuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'ADMIN',
      startTelegramLogin,
      pollTelegramLogin,
      updateProfile,
      logout,
      reload,
    }),
    [user, isLoading, startTelegramLogin, pollTelegramLogin, updateProfile, logout, reload]
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
