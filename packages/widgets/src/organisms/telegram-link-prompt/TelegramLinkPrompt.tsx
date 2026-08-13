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
 * Второй шаг написан в двух вариантах намеренно. Кнопку «Start» Telegram
 * показывает только в чате **без истории**: тот, кто открывал бота раньше (а
 * после сброса базы привязка пропадает, чат — нет), видит обычное поле ввода,
 * ищет кнопку, не находит и застревает — код при этом уходит в лог сервера, а
 * человек ждёт его в Telegram.
 *
 * Ссылка держится чистой (`https://t.me/<username>`, без `?start=`) просто за
 * ненадобностью: payload'а тут нет. Сам бот deep-link переживает — он ловит
 * `/start` через `CommandStart()` (`apps/api/app/telegram/handlers.py`), то
 * есть вместе с аргументом.
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
        <li>Нажмите «Start». Если чат с ботом уже открывали, кнопки не будет — отправьте /start сообщением.</li>
        <li>Поделитесь номером: бот попросит об этом сам, кнопкой под полем ввода.</li>
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
