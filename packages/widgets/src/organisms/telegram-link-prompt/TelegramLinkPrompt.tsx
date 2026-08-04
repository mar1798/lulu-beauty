import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ITelegramLinkPromptProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import * as styles from './TelegramLinkPrompt.css'

/**
 * Инструкция по привязке Telegram — без неё код просто некуда прислать.
 *
 * Ссылка обязана быть **чистой**: `https://t.me/<username>`, без `?start=`.
 * Бот сравнивает текст сообщения с `/start` точно
 * (`apps/api/app/telegram/bot.py`: `F.text == "/start"`), а deep-link с
 * payload присылает `/start <payload>` и уходит в fallback — человек получит
 * ответ без кнопки «поделиться контактом» и застрянет.
 */
export const TelegramLinkPrompt: FC<ITelegramLinkPromptProps & IBasicStyling> = ({
  botUsername,
  isLinked = false,
  className,
}) => {
  if (isLinked) {
    return (
      <Alert className={className} tone="success" title="Telegram привязан">
        Коды подтверждения приходят в чат с ботом.
      </Alert>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      <Heading level={2} size="xs">
        Код приходит в Telegram
      </Heading>

      <ol className={styles.steps}>
        <li>Откройте бота по кнопке ниже.</li>
        <li>Нажмите «Start» — команду набирать не нужно.</li>
        <li>Поделитесь контактом: бот попросит об этом сам.</li>
      </ol>

      {botUsername !== '' && (
        <Button
          className={styles.link}
          variant="secondary"
          size="sm"
          // Именно такой адрес, без параметров: см. комментарий выше.
          link={{ href: `https://t.me/${botUsername}`, target: '_blank' }}
        >
          Открыть бота
        </Button>
      )}
    </div>
  )
}
