import type { OtpPurpose } from 'widgets/types'

/**
 * Что подтверждаем на странице `/verify-otp`.
 *
 * Телефон намеренно **не** уезжает в query-параметры: адрес попадает в
 * историю браузера, в `Referer` и в логи, а это персональные данные. Живёт в
 * `sessionStorage` — переживает перезагрузку страницы и умирает вместе со
 * вкладкой.
 */

const STORAGE_KEY = 'lb_pending_otp'

export interface IPendingOtp {
  phone: string
  purpose: OtpPurpose
  /**
   * Куда вернуть после подтверждения. Нужен, когда вход начался с закрытой
   * страницы (`/admin/*` уводит гостя на `/login?next=…`): после кода человек
   * должен оказаться там, куда шёл, а не в каталоге.
   */
  next?: string
}

/**
 * Кеш последнего разобранного значения.
 *
 * Нужен, потому что читатель — `useSyncExternalStore`, а тот вызывает
 * снимок на каждом рендере и зациклится, если каждый раз возвращать новый
 * объект. Ключ кеша — сырая строка из хранилища.
 */
let cachedRaw: string | null = null
let cachedValue: IPendingOtp | null = null

const parse = (raw: string | null): IPendingOtp | null => {
  if (raw === null) {
    return null
  }

  try {
    const value: unknown = JSON.parse(raw)

    if (typeof value !== 'object' || value === null) {
      return null
    }

    const { phone, purpose, next } = value as Partial<IPendingOtp>

    if (
      typeof phone !== 'string' ||
      (purpose !== 'LOGIN' && purpose !== 'REGISTER' && purpose !== 'RESET_PASSWORD')
    ) {
      return null
    }

    return { phone, purpose, next: typeof next === 'string' ? next : undefined }
  } catch {
    return null
  }
}

export const readPendingOtp = (): IPendingOtp | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY)

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedValue = parse(raw)
  }

  return cachedValue
}

export const savePendingOtp = (value: IPendingOtp): void => {
  const raw = JSON.stringify(value)

  window.sessionStorage.setItem(STORAGE_KEY, raw)
  cachedRaw = raw
  cachedValue = value
}

export const clearPendingOtp = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEY)
  cachedRaw = null
  cachedValue = null
}
