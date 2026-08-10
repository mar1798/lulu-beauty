import React, { createContext, useCallback, useContext, useMemo } from 'react'
import useSWR from 'swr'
import type { IAuthUser, OtpPurpose } from 'widgets/types'
import { isApiError } from '@/services/apiErrors'
import { meKey } from '@/services/swrKeys'
import {
  forgotPassword as forgotPasswordRequest,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  resetPassword as resetPasswordRequest,
  updateProfile as updateProfileRequest,
  verifyOtp as verifyOtpRequest,
  type IForgotPasswordInput,
  type ILoginInput,
  type IRegisterInput,
  type IResetPasswordInput,
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
  forgotPassword: (input: IForgotPasswordInput) => Promise<OtpPurpose>
  resetPassword: (input: IResetPasswordInput) => Promise<IAuthUser>
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
  const { data, isLoading, mutate } = useSWR<IAuthUser | null>(meKey, loadUser)
  const user = data ?? null

  const reload = useCallback(async (): Promise<void> => {
    await mutate()
  }, [mutate])

  const register = useCallback(
    async (input: IRegisterInput): Promise<OtpPurpose> => (await registerRequest(input)).purpose,
    []
  )

  const login = useCallback(
    async (input: ILoginInput): Promise<OtpPurpose> => (await loginRequest(input)).purpose,
    []
  )

  const verifyOtp = useCallback(
    async (input: IVerifyOtpInput): Promise<IAuthUser> => {
      const verified = await verifyOtpRequest(input)

      await mutate(verified, { revalidate: false })

      return verified
    },
    [mutate]
  )

  const forgotPassword = useCallback(
    async (input: IForgotPasswordInput): Promise<OtpPurpose> =>
      (await forgotPasswordRequest(input)).purpose,
    []
  )

  const resetPassword = useCallback(
    async (input: IResetPasswordInput): Promise<IAuthUser> => {
      const verified = await resetPasswordRequest(input)

      await mutate(verified, { revalidate: false })

      return verified
    },
    [mutate]
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
      register,
      login,
      verifyOtp,
      forgotPassword,
      resetPassword,
      updateProfile,
      logout,
      reload,
    }),
    [
      user,
      isLoading,
      register,
      login,
      verifyOtp,
      forgotPassword,
      resetPassword,
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
