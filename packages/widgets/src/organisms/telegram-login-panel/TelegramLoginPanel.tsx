import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ITelegramLoginPanelProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import * as styles from './TelegramLoginPanel.css'

/**
 * Вход через Telegram: одна кнопка, а не форма.
 *
 * Ни телефона, ни пароля, ни кода тут нет и быть не должно — личность
 * подтверждает бот. Строка под кнопкой поэтому не про нас, а про человека:
 * ждём мы **его** действия в Telegram, и сказать надо, что делать там и что
 * произойдёт здесь без него, — иначе он вернётся на неизменившийся экран и
 * станет искать, что бы ещё нажать.
 *
 * Спиннера в этой строке нет намеренно: крутящийся индикатор обещает работу,
 * которая идёт и вот-вот кончится, а тут ничего не происходит — и не начнёт,
 * пока человек не откроет бота. Минуту такого «загрузки» читаешь как зависший
 * экран.
 *
 * QR приходит слотом: кодирование ссылки — вычисление, а не разметка, и тянуть
 * ради него зависимость в библиотеку виджетов незачем (сайт грузит её
 * динамически, только на этой странице).
 */
export const TelegramLoginPanel: FC<ITelegramLoginPanelProps & IBasicStyling> = ({
  botUrl,
  status,
  qr,
  loginWidget,
  error = null,
  onRetry,
  className,
}) => {
  const isDead = status === 'expired' || status === 'error'

  return (
    <div className={clsx(styles.container, className)}>
      {isDead ? (
        <Alert
          tone={status === 'expired' ? 'info' : 'danger'}
          title={status === 'expired' ? 'Ссылка устарела' : 'Не получилось начать вход'}
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Получить новую ссылку
            </Button>
          }
        >
          {status === 'expired'
            ? 'Ссылка для входа живёт несколько минут — попросите новую и откройте её сразу.'
            : (error ?? 'Попробуйте ещё раз или обновите страницу.')}
        </Alert>
      ) : (
        <>
          <ol className={styles.steps}>
            <li>Откройте бота кнопкой ниже — на телефоне или в Telegram на компьютере.</li>
            <li>Нажмите «Start», если чат новый, — или просто дождитесь ответа бота.</li>
            <li>
              В первый раз бот попросит поделиться номером — это и есть регистрация,
              заполнять ничего не нужно.
            </li>
          </ol>

          <Button
            className={styles.action}
            size="lg"
            isFullWidth={true}
            // `isLoading`, а не `disabled`: ссылки ещё нет, но кнопка не «сломана».
            isLoading={botUrl === null}
            link={botUrl === null ? undefined : { href: botUrl, target: '_blank' }}
          >
            Войти через Telegram
          </Button>

          {/*
            Строка живёт рядом с кнопкой, а не вместо неё: человек мог открыть
            бота и вернуться, ничего там не нажав, — тогда ему нужна та же кнопка.
          */}
          {status === 'waiting' && (
            <Text className={styles.waiting} size="sm" tone="secondary">
              Продолжите вход в Telegram — после подтверждения мы автоматически
              переведём вас на сайт.
            </Text>
          )}

          {/*
            Ниже основной кнопки, а не выше: виджет входит в один клик, но только тех,
            кто уже делился номером с ботом. Новому человеку он ответит отказом, и
            поставить его первым значило бы предложить незнакомцу тупик.
          */}
          {loginWidget !== undefined && loginWidget !== null && (
            <div className={styles.alternative}>
              <Text size="sm" tone="secondary">
                Уже пользовались ботом? Войдите в один клик
              </Text>
              {loginWidget}
            </div>
          )}

          {qr !== undefined && qr !== null && (
            <div className={styles.qr}>
              {qr}
              <Text size="xs" tone="muted">
                Или отсканируйте код телефоном
              </Text>
            </div>
          )}
        </>
      )}
    </div>
  )
}
