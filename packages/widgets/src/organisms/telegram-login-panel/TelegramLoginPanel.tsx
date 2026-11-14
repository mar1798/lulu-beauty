import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ITelegramLoginPanelProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import { IconTelegram } from '../../svg/icons'
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
  notice,
  help,
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
            ? 'Ссылка для входа живёт несколько минут - попросите новую и откройте её сразу'
            : (error ?? 'Попробуйте ещё раз или обновите страницу')}
        </Alert>
      ) : (
        <>
          {notice}

          {/*
            Шаги называют кнопки теми же словами, что человек увидит в Telegram:
            «Запустить» — подпись клиента на русском, «Поделиться номером телефона» — кнопка
            бота (`SHARE_CONTACT_BUTTON` в `apps/api/app/telegram/messages.py`).
            Переименуют там — менять и здесь. Чаще всего вход бросают на третьем
            шаге: клавиатура бота свёрнута, и кнопки просто не видно.
          */}
          <ol className={styles.steps}>
            <li>Нажмите «Войти через Telegram» - откроется наш бот</li>
            <li>В Telegram нажмите «Запустить» (или «Start»)</li>
            <li>
              В первый раз бот попросит поделиться номером - нажмите кнопку «📱 Поделиться номером
              телефона» внизу экрана, это вся регистрация. Кнопки не видно? Нажмите значок
              клавиатуры рядом с полем ввода
            </li>
          </ol>

          <Button
            className={styles.action}
            size="lg"
            isFullWidth={true}
            // `isLoading`, а не `disabled`: ссылки ещё нет, но кнопка не «сломана».
            isLoading={botUrl === null}
            iconStart={<IconTelegram />}
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
              Продолжите вход в Telegram - после подтверждения мы автоматически переведём вас на
              сайт
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

          {help !== undefined && help !== null && <div className={styles.help}>{help}</div>}
        </>
      )}
    </div>
  )
}
