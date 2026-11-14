import clsx from 'clsx'
import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Alert, AppLink, Spinner, Text } from 'widgets/atoms'
import { pluralize } from 'widgets/utils'
import { TelegramLoginPanel } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { TelegramLoginWidget, isTelegramLoginWidgetEnabled } from '@/components/TelegramLoginWidget'
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated'
import { useQrCode } from '@/hooks/useQrCode'
import { useTelegramLogin } from '@/hooks/useTelegramLogin'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { safeRedirectPath } from '@/utils/redirect'
import { useGuestState } from '@/utils/guestStorage'
import { INSTAGRAM_URL } from '@/utils/contacts'
import * as layout from '@/styles/layout.css'
import * as styles from '@/styles/login.css'
import { HalloweenScene } from '@/halloween/HalloweenScene'
import * as halloween from '@/halloween/halloween.css'

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
/**
 * Где взять Telegram. Страница самого Telegram, а не магазины приложений по
 * отдельности: она сама отправит в нужный — App Store, Google Play или версию для
 * компьютера.
 */
const TELEGRAM_APPS_URL = 'https://telegram.org/apps'

/** Тач-экран или узкое окно — ширина `md` из `widgets/breakpoints`. */
const HANDHELD_QUERY = '(pointer: coarse), (max-width: 767px)'

const LoginPage: React.FC = () => {
  const router = useRouter()
  // Сюда уводит гейт админки: `/admin/*` у гостя даёт `/login?next=/admin/...`.
  const next = safeRedirectPath(router.query.next)
  const isRedirecting = useRedirectIfAuthenticated(next)

  // Пока сессия проверяется, вход не начинаем: вошедший всё равно уедет отсюда,
  // а лишняя ссылка на бота была бы выдана и брошена.
  const { botUrl, status, error, retry } = useTelegramLogin(!isRedirecting)
  /*
    QR — для тех, кто сканирует его другим телефоном. На самом телефоне бот
    открывается кнопкой, а код пришлось бы наводить сам на себя: его не рисуем и
    кодировщик не грузим.
  */
  const isHandheld = useMediaQuery(HANDHELD_QUERY)
  const { dataUrl: qrDataUrl, isFailed: isQrFailed } = useQrCode(isHandheld ? null : botUrl)

  /*
    Гость пришёл сюда с «Войти и оформить» — со своей корзиной в браузере. Сказать,
    что она не пропадёт, нужно здесь, до Telegram: иначе вход читается как «начинать
    заново», и это ровно тот момент, когда его бросают.
  */
  const guestItemCount = useGuestState().cart.lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <SiteLayout>
      <Head>
        <title>Вход - Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      {/*
        Высота зарезервирована на обёртке, а не внутри карточки: проверка сессии
        показывает спиннер, а панель входа вчетверо выше его — подвал переезжал
        (см. `styles/layout.css`). Резерв внутри карточки растягивал бы и её саму,
        оставляя под панелью пустой подвал в треть экрана; на обёртке он только
        центрирует карточку по высоте экрана.
      */}
      <AuthTemplate
        // `authHost` делает карточку точкой отсчёта для хэллоуинской стайки над заголовком.
        className={clsx(layout.sessionArea, halloween.authHost)}
        title="Вход"
        subtitle="Через Telegram - регистрация не нужна, аккаунт заведётся сам"
        /*
          Согласие — под карточкой, но на экране одновременно с кнопкой входа:
          вход здесь и есть регистрация, аккаунт заводится в тот же момент, и
          сказать, что при этом сохраняется, нужно до нажатия, а не после.

          Тот же текст живёт в первом сообщении бота (`telegram/messages.py`,
          `start`) — оба пути к аккаунту ведут через него, и оба обязаны о нём
          предупредить. Слово в слово они не совпадают намеренно: здесь человек
          нажимает кнопку на сайте, там — кнопку в чате.

          Показывается и в состоянии проверки сессии тоже: это слот шаблона,
          а не часть панели, и мигать вместе со спиннером ему незачем.
        */
        footer={
          <Text size="sm" tone="muted">
            Входя, вы соглашаетесь на обработку персональных данных: магазин сохранит ваш номер, имя
            из профиля Telegram и чат с ботом - чтобы принимать заявки и писать вам о них. Подробнее
            - в{' '}
            <AppLink href="/privacy" className={styles.inlineLink}>
              политике обработки данных
            </AppLink>
            .
          </Text>
        }
      >
        <HalloweenScene variant="auth" />
        {isRedirecting ? (
          <Spinner label="Проверяем сессию" />
        ) : (
          <TelegramLoginPanel
            botUrl={botUrl}
            status={status}
            error={error}
            onRetry={retry}
            notice={
              guestItemCount > 0 ? (
                <Alert tone="info">
                  В корзине {pluralize(guestItemCount, ['товар', 'товара', 'товаров'])} - после
                  входа они перенесутся в аккаунт, и заявку можно будет отправить
                </Alert>
              ) : null
            }
            /*
              Обход для тех, кого вход через Telegram отсеивал молча: у человека нет
              приложения или он застрял в боте. Instagram — единственный канал
              владельца вне бота (`utils/contacts.ts`); обещаем там помощь, а не
              заявку «вручную» — заявка живёт на аккаунте.
            */
            help={
              <>
                <Text size="sm" tone="secondary">
                  Нет Telegram? Он бесплатный и ставится за пару минут -{' '}
                  <AppLink href={TELEGRAM_APPS_URL} target="_blank" className={styles.inlineLink}>
                    скачать Telegram
                  </AppLink>
                </Text>
                <Text size="sm" tone="secondary">
                  Не получается войти?{' '}
                  <AppLink href={INSTAGRAM_URL} target="_blank" className={styles.inlineLink}>
                    Напишите нам в Instagram
                  </AppLink>{' '}
                  - поможем
                </Text>
              </>
            }
            /*
              Виджета нет вовсе, пока домен не прописан боту в BotFather: там он
              нарисуется и откажет, а сломанная кнопка рядом с рабочей хуже, чем
              её отсутствие. Слот, а не импорт внутри виджетов, — как и QR:
              рисует кнопку чужой скрипт с telegram.org.
            */
            loginWidget={isTelegramLoginWidgetEnabled() ? <TelegramLoginWidget /> : null}
            qr={
              /*
                Подложка появляется вместе с панелью, а код — когда посчитается
                (кодирование отложено до простоя, см. `useQrCode`). Без неё код
                въезжал в готовый экран и сдвигал всё, что ниже, — в том числе
                подвал.

                Отказ кодировщика — единственный случай, когда места под код нет
                вовсе: держать пустой квадрат, в котором ничего не появится,
                хуже, чем не обещать кода совсем.
              */
              isHandheld || isQrFailed ? null : (
                <div className={styles.qr}>
                  {qrDataUrl !== null && (
                    /*
                      Обычный <img>, а не next/image: это `data:`-URL,
                      сгенерированный в браузере, — оптимизатору Next нечего
                      с ним делать.
                    */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.qrImage}
                      src={qrDataUrl}
                      alt="QR-код со ссылкой на бота"
                    />
                  )}
                </div>
              )
            }
          />
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default LoginPage
