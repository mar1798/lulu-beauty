import React, { useEffect, useRef } from 'react'
import { useToast } from 'widgets/contexts'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError, messageForError } from '@/services/apiErrors'
import { publicConfig } from '@/сonfig'

/**
 * Кнопка «Log in with Telegram» — вход в один клик для тех, кто уже привязывал бота.
 *
 * Быстрая дорожка, а не замена основной: подпись виджета доказывает личность, но не
 * даёт номера телефона, а без него аккаунта здесь не бывает. Новому человеку виджет
 * ответит «нужна регистрация» и отправит к боту — поэтому он и стоит **под** основной
 * кнопкой, а не вместо неё.
 *
 * Рисуется скриптом Telegram, а не разметкой: кнопка обязана быть настоящим iframe с
 * telegram.org — иначе Telegram не станет по ней авторизовывать. Отсюда и `data-onauth`,
 * который умеет позвать только глобальную функцию по имени.
 */

interface ITelegramWidgetUser {
  hash: string
  [field: string]: unknown
}

declare global {
  interface Window {
    onTelegramLoginWidgetAuth?: (user: ITelegramWidgetUser) => void
  }
}

const SCRIPT_URL = 'https://telegram.org/js/telegram-widget.js?22'

const CALLBACK_NAME = 'onTelegramLoginWidgetAuth'

export const isTelegramLoginWidgetEnabled = (): boolean =>
  publicConfig('telegramLoginWidget') && publicConfig('telegramBotUsername') !== ''

export const TelegramLoginWidget: React.FC = () => {
  const { signInWithTelegramWidget } = useAuth()
  const { notify } = useToast()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = container.current

    if (node === null || !isTelegramLoginWidgetEnabled()) {
      return
    }

    window[CALLBACK_NAME] = (user: ITelegramWidgetUser): void => {
      void signInWithTelegramWidget(user).catch((cause: unknown) => {
        notify({
          tone:
            isApiError(cause) && cause.code === 'telegram_account_not_linked' ? 'info' : 'danger',
          title: 'Вход через Telegram',
          description: messageForError(cause, 'auth.telegram'),
          duration: 0,
        })
      })
    }

    const script = document.createElement('script')

    script.src = SCRIPT_URL
    script.async = true
    script.setAttribute('data-telegram-login', publicConfig('telegramBotUsername'))
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    // Аватарка не нужна: человек и так знает, под каким аккаунтом сидит, а лишняя
    // картинка тянет ещё один запрос к telegram.org.
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-onauth', `${CALLBACK_NAME}(user)`)
    node.appendChild(script)

    return () => {
      node.replaceChildren()
      delete window[CALLBACK_NAME]
    }
  }, [signInWithTelegramWidget, notify])

  if (!isTelegramLoginWidgetEnabled()) {
    return null
  }

  return <div ref={container} />
}
