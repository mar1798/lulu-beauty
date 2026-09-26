import React from 'react'
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton'
import { useTelegramMiniApp } from '@/hooks/useTelegramMiniApp'

/**
 * Ничего не рисует — существует ради того, чтобы хук жил внутри провайдеров.
 *
 * Вход из Mini App должен случаться на любой странице, а не только на `/login`: внутри
 * Telegram человек попадает сразу в каталог, и страницы входа в этом сценарии нет.
 * Там же — системная кнопка «Назад»: она тоже нужна на любой странице.
 */
export const TelegramMiniAppSession: React.FC = () => {
  useTelegramMiniApp()
  useTelegramBackButton()

  return null
}
