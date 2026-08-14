import React from 'react'
import { useTelegramMiniApp } from '@/hooks/useTelegramMiniApp'

/**
 * Ничего не рисует — существует ради того, чтобы хук жил внутри провайдеров.
 *
 * Вход из Mini App должен случаться на любой странице, а не только на `/login`: внутри
 * Telegram человек попадает сразу в каталог, и страницы входа в этом сценарии нет.
 */
export const TelegramMiniAppSession: React.FC = () => {
  useTelegramMiniApp()

  return null
}
