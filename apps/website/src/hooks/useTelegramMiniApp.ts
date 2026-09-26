import { useCallback, useEffect, useRef } from 'react'
import { useToast } from 'widgets/contexts'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError, messageForError } from '@/services/apiErrors'
import { announceReady, readMiniAppInitData, readMiniAppUserId } from '@/utils/telegramMiniApp'

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
 *
 * Гость повторяет вход, когда возвращается в окно: тост отправляет его в бота, и
 * вернётся он оттуда уже зарегистрированным — без повтора магазин считал бы его гостем
 * до перезапуска Mini App.
 */
export const useTelegramMiniApp = (): void => {
  const { user, isLoading, signInWithMiniApp, logout } = useAuth()
  const { notify, dismiss } = useToast()
  /** Первая попытка — одна на загрузку страницы; повторы идут только по возвращению в окно. */
  const hasTried = useRef(false)
  /** Сверка аккаунта — тоже одна: второй вход с той же подписью ничего не изменит. */
  const hasReconciled = useRef(false)
  const isSigningIn = useRef(false)
  /** Тост «Нужна регистрация» — закрываем его, как только вход удался. */
  const notLinkedToast = useRef<string | null>(null)

  const explainNotLinked = useCallback(
    (cause: unknown): void => {
      if (
        !isApiError(cause) ||
        cause.code !== 'telegram_account_not_linked' ||
        notLinkedToast.current !== null
      ) {
        return
      }

      notLinkedToast.current = notify({
        tone: 'info',
        title: 'Нужна регистрация',
        description: messageForError(cause, 'auth.telegram'),
        // Не закрывать само: это не уведомление об успехе, а единственное
        // объяснение, почему магазин считает человека гостем.
        duration: 0,
      })
    },
    [notify]
  )

  const signIn = useCallback(
    async (initData: string): Promise<void> => {
      if (isSigningIn.current) {
        return
      }

      isSigningIn.current = true

      try {
        await signInWithMiniApp(initData)

        if (notLinkedToast.current !== null) {
          dismiss(notLinkedToast.current)
          notLinkedToast.current = null
        }
      } catch (cause: unknown) {
        explainNotLinked(cause)
      } finally {
        isSigningIn.current = false
      }
    },
    [signInWithMiniApp, dismiss, explainNotLinked]
  )

  useEffect(() => {
    const initData = readMiniAppInitData()

    if (initData === null) {
      return
    }

    announceReady()

    // Ждём первой проверки сессии: у вернувшегося в Mini App человека cookie уже стоят,
    // и лишний вход выдал бы вторую пару токенов вместо ничего.
    if (isLoading) {
      return
    }

    if (user === null) {
      if (!hasTried.current) {
        hasTried.current = true
        void signIn(initData)
      }

      return
    }

    /*
      Cookie webview общие для всех аккаунтов Telegram на телефоне. Если окно открыл
      не тот, чья сессия стоит, заявка ушла бы от чужого имени — поэтому входим
      заново подписью открывшего. Не вышло (его аккаунта в магазине нет) — выходим:
      остаться в чужой сессии хуже, чем гостем.
    */
    const openerId = readMiniAppUserId(initData)

    if (
      hasReconciled.current ||
      openerId === null ||
      user.telegramUserId === null ||
      user.telegramUserId === openerId
    ) {
      return
    }

    hasReconciled.current = true

    const reconcile = async (): Promise<void> => {
      try {
        await signInWithMiniApp(initData)
      } catch (cause: unknown) {
        hasTried.current = true

        try {
          await logout()
        } catch {
          // Выйти не удалось — сессия осталась, но и сделать тут больше нечего.
        }

        explainNotLinked(cause)
      }
    }

    void reconcile()
  }, [user, isLoading, signIn, signInWithMiniApp, logout, explainNotLinked])

  useEffect(() => {
    const initData = readMiniAppInitData()

    if (initData === null || isLoading || user !== null) {
      return
    }

    const retry = (): void => {
      if (document.visibilityState === 'visible') {
        void signIn(initData)
      }
    }

    document.addEventListener('visibilitychange', retry)

    return (): void => document.removeEventListener('visibilitychange', retry)
  }, [user, isLoading, signIn])
}
