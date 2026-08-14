import { useEffect, useRef } from 'react'
import { useToast } from 'widgets/contexts'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError, messageForError } from '@/services/apiErrors'
import { announceReady, readMiniAppInitData } from '@/utils/telegramMiniApp'

/**
 * Вход без единого действия — когда сайт открыт как Mini App внутри Telegram.
 *
 * Ни ссылки на бота, ни ожидания: Telegram уже подписал, кто открыл окно, и остаётся
 * только обменять подпись на cookie. Экран входа в этом сценарии человек не видит вовсе,
 * и ради этого шаг и делался.
 *
 * Остаться гостем — нормальный исход, а не сбой: подпись доказывает личность, но не даёт
 * номера телефона, поэтому у того, кто ни разу не открывал бота, аккаунта ещё нет. Про
 * это говорим тостом — единственная поправимая из ошибок, — а остальные проглатываем:
 * предлагать «попробуйте ещё раз» нечему, попытку человек не делал и повторить не может.
 */
export const useTelegramMiniApp = (): void => {
  const { user, isLoading, signInWithMiniApp } = useAuth()
  const { notify } = useToast()
  /** Одна попытка на загрузку страницы: подпись одна, и вторая ничего не изменит. */
  const hasTried = useRef(false)

  useEffect(() => {
    const initData = readMiniAppInitData()

    if (initData === null) {
      return
    }

    announceReady()

    // Ждём первой проверки сессии: у вернувшегося в Mini App человека cookie уже стоят,
    // и лишний вход выдал бы вторую пару токенов вместо ничего.
    if (isLoading || user !== null || hasTried.current) {
      return
    }

    hasTried.current = true

    const signIn = async (): Promise<void> => {
      try {
        await signInWithMiniApp(initData)
      } catch (cause: unknown) {
        if (isApiError(cause) && cause.code === 'telegram_account_not_linked') {
          notify({
            tone: 'info',
            title: 'Нужна регистрация',
            description: messageForError(cause, 'auth.telegram'),
            // Не закрывать само: это не уведомление об успехе, а единственное
            // объяснение, почему магазин считает человека гостем.
            duration: 0,
          })
        }
      }
    }

    void signIn()
  }, [user, isLoading, signInWithMiniApp, notify])
}
