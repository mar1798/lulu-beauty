import type { IAuthUser } from 'widgets/types'
import { api, nextApi } from '../api'

/**
 * Авторизация ходит не в бэкенд напрямую, а в собственные ручки Next
 * (`src/pages/api/auth/*`): только они видят JWT и кладут их в httpOnly-cookie
 * `lb_at`/`lb_rt`. В браузерном JS токенов нет ни на одном шаге.
 *
 * Ни пароля, ни кода здесь нет: личность подтверждает бот, а вкладка только
 * открывает сессию и ждёт. Секрет опроса тоже живёт в cookie (`lb_ls`) —
 * поэтому у `pollTelegramLogin` нет ни одного аргумента.
 *
 * Профиль (`PATCH /users/me`) — обычная авторизованная ручка бэка, идёт через прокси.
 */

export interface ITelegramLoginSession {
  /** Ссылка на бота с одноразовым payload. */
  botUrl: string
  expiresAt: string
}

export interface ITelegramLoginPoll {
  status: 'PENDING' | 'AUTHORIZED'
  /** Профиль появляется вместе с `AUTHORIZED`; `null` — если он не дочитался. */
  user?: IAuthUser | null
}

export const startTelegramLogin = (): Promise<ITelegramLoginSession> =>
  nextApi.post('/auth/telegram/session')

export const pollTelegramLogin = (): Promise<ITelegramLoginPoll> =>
  nextApi.post('/auth/telegram/poll')

/**
 * Вход, подтверждённый подписью Telegram, а не ожиданием в боте: виджет на странице
 * входа и Mini App внутри Telegram. Обе ручки отвечают одинаково — профилем, — потому
 * что ждать в них нечего: подпись либо сходится, либо нет.
 *
 * `null` в профиле значит «вошли, но профиль не дочитался» — cookie уже стоят, и его
 * достаточно перезапросить.
 */
export interface ITelegramSignIn {
  user: IAuthUser | null
}

/** `payload` уходит как есть: подписью Telegram накрыты все поля, включая лишние. */
export const signInWithTelegramWidget = (
  payload: Record<string, unknown>
): Promise<ITelegramSignIn> => nextApi.post('/auth/telegram/widget', { body: payload })

export const signInWithMiniApp = (initData: string): Promise<ITelegramSignIn> =>
  nextApi.post('/auth/telegram/mini-app', { body: { initData } })

export const logout = (): Promise<void> => nextApi.post('/auth/logout')

/** Профиль текущего пользователя; `ApiError` со статусом 401 — значит, не залогинен. */
export const getMe = (): Promise<IAuthUser> => nextApi.get('/auth/me')

export const updateProfile = (name: string): Promise<IAuthUser> =>
  api.patch('/users/me', { body: { name } })
