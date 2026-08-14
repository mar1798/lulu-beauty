import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Spinner } from 'widgets/atoms'
import { TelegramLoginPanel } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { TelegramLoginWidget, isTelegramLoginWidgetEnabled } from '@/components/TelegramLoginWidget'
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated'
import { useQrCode } from '@/hooks/useQrCode'
import { useTelegramLogin } from '@/hooks/useTelegramLogin'
import { safeRedirectPath } from '@/utils/redirect'
import * as styles from '@/styles/login.css'

/**
 * Вход — он же регистрация.
 *
 * Ни телефона, ни пароля, ни кода: личность подтверждает бот, а страница только
 * открывает сессию и ждёт. Отдельной регистрации нет вовсе — аккаунт заводится
 * в тот момент, когда человек делится с ботом номером, и Telegram сам ручается
 * за этот номер (`app/telegram/handlers.py`, `handle_contact`).
 *
 * Вошедшего уводит `useRedirectIfAuthenticated` — тем же способом, что и
 * раньше: опрос кладёт профиль в кеш сессии, и редирект случается сам.
 */
const LoginPage: React.FC = () => {
  const router = useRouter()
  // Сюда уводит гейт админки: `/admin/*` у гостя даёт `/login?next=/admin/...`.
  const next = safeRedirectPath(router.query.next)
  const isRedirecting = useRedirectIfAuthenticated(next)

  // Пока сессия проверяется, вход не начинаем: вошедший всё равно уедет отсюда,
  // а лишняя ссылка на бота была бы выдана и брошена.
  const { botUrl, status, error, retry } = useTelegramLogin(!isRedirecting)
  const qrDataUrl = useQrCode(botUrl)

  return (
    <SiteLayout>
      <Head>
        <title>Вход — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate
        title="Вход"
        subtitle="Через Telegram — регистрация не нужна, аккаунт заведётся сам."
      >
        {isRedirecting ? (
          <Spinner label="Проверяем сессию" />
        ) : (
          <TelegramLoginPanel
            botUrl={botUrl}
            status={status}
            error={error}
            onRetry={retry}
            /*
              Виджета нет вовсе, пока домен не прописан боту в BotFather: там он
              нарисуется и откажет, а сломанная кнопка рядом с рабочей хуже, чем её
              отсутствие. Слот, а не импорт внутри виджетов, — как и QR: рисует
              кнопку чужой скрипт с telegram.org.
            */
            loginWidget={isTelegramLoginWidgetEnabled() ? <TelegramLoginWidget /> : null}
            qr={
              qrDataUrl === null ? null : (
                /*
                  Обычный <img>, а не next/image: это `data:`-URL, сгенерированный
                  в браузере, — оптимизатору Next нечего с ним делать.
                */
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.qr} src={qrDataUrl} alt="QR-код со ссылкой на бота" />
              )
            }
          />
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default LoginPage
