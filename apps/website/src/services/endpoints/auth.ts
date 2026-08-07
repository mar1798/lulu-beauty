import type { IAuthUser, OtpPurpose } from 'widgets/types'
import { api, nextApi } from '../api'

/**
 * Авторизация ходит не в бэкенд напрямую, а в собственные ручки Next
 * (`src/pages/api/auth/*`): только они видят JWT и кладут их в httpOnly-cookie
 * `lb_at`/`lb_rt`. В браузерном JS токенов нет ни на одном шаге.
 *
 * Профиль (`PATCH /users/me`) — обычная авторизованная ручка бэка, идёт через прокси.
 */

export interface IOtpSent {
  message: string
  purpose: OtpPurpose
}

export interface IRegisterInput {
  phone: string
  name: string
  password: string
}

export interface ILoginInput {
  phone: string
  password: string
}

export interface IVerifyOtpInput {
  phone: string
  code: string
  purpose: OtpPurpose
}

export interface IForgotPasswordInput {
  phone: string
}

export interface IResetPasswordInput {
  phone: string
  code: string
  newPassword: string
}

export const register = (input: IRegisterInput): Promise<IOtpSent> =>
  nextApi.post('/auth/register', { body: input })

export const login = (input: ILoginInput): Promise<IOtpSent> =>
  nextApi.post('/auth/login', { body: input })

/** Успешная проверка кода сразу ставит cookie и возвращает готовый профиль. */
export const verifyOtp = (input: IVerifyOtpInput): Promise<IAuthUser> =>
  nextApi.post('/auth/verify-otp', { body: input })

export const forgotPassword = (input: IForgotPasswordInput): Promise<IOtpSent> =>
  nextApi.post('/auth/forgot-password', { body: input })

/** Как и `verifyOtp`, сразу ставит cookie и возвращает готовый профиль. */
export const resetPassword = (input: IResetPasswordInput): Promise<IAuthUser> =>
  nextApi.post('/auth/reset-password', { body: input })

export const logout = (): Promise<void> => nextApi.post('/auth/logout')

/** Профиль текущего пользователя; `ApiError` со статусом 401 — значит, не залогинен. */
export const getMe = (): Promise<IAuthUser> => nextApi.get('/auth/me')

export const updateProfile = (name: string): Promise<IAuthUser> =>
  api.patch('/users/me', { body: { name } })
