import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { IAuthUser, OtpPurpose } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  updateProfile as updateProfileRequest,
  verifyOtp as verifyOtpRequest,
  type ILoginInput,
  type IRegisterInput,
  type IVerifyOtpInput,
} from '@/services/endpoints/auth'

/**
 * Состояние авторизации на клиенте. Токенов здесь нет и быть не может —
 * они лежат в httpOnly-cookie; единственный способ узнать, кто мы, —
 * спросить у `/api/auth/me`.
 *
 * `register`/`login` возвращают `OtpPurpose`: он нужен второму шагу
 * (`verifyOtp`) и определяет, что показывать на экране ввода кода.
 */

export interface IAuthContextValue {
  user: IAuthUser | null
  /** true, пока не завершилась первая проверка сессии — до этого не редиректим. */
  isLoading: boolean
  isAdmin: boolean
  register: (input: IRegisterInput) => Promise<OtpPurpose>
  login: (input: ILoginInput) => Promise<OtpPurpose>
  verifyOtp: (input: IVerifyOtpInput) => Promise<IAuthUser>
  updateProfile: (name: string) => Promise<IAuthUser>
  logout: () => Promise<void>
  reload: () => Promise<void>
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
  const [user, setUser] = useState<IAuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)

    try {
      setUser(await loadUser())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    loadUser()
      .then(loaded => {
        if (active) {
          setUser(loaded)
        }
      })
      .catch(() => {
        if (active) {
          setUser(null)
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const register = useCallback(
    async (input: IRegisterInput): Promise<OtpPurpose> => (await registerRequest(input)).purpose,
    []
  )

  const login = useCallback(
    async (input: ILoginInput): Promise<OtpPurpose> => (await loginRequest(input)).purpose,
    []
  )

  const verifyOtp = useCallback(async (input: IVerifyOtpInput): Promise<IAuthUser> => {
    const verified = await verifyOtpRequest(input)

    setUser(verified)

    return verified
  }, [])

  const updateProfile = useCallback(async (name: string): Promise<IAuthUser> => {
    const updated = await updateProfileRequest(name)

    setUser(updated)

    return updated
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<IAuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'ADMIN',
      register,
      login,
      verifyOtp,
      updateProfile,
      logout,
      reload,
    }),
    [user, isLoading, register, login, verifyOtp, updateProfile, logout, reload]
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
