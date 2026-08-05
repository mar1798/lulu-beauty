import React, { useState, useSyncExternalStore } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Alert, AppLink, Text, formatNational, toNationalDigits } from 'widgets/atoms'
import { OtpVerifyForm, TelegramLinkPrompt } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError } from '@/services/apiErrors'
import { publicConfig } from '@/сonfig'
import { clearPendingOtp, readPendingOtp } from '@/utils/otpSession'
import { safeRedirectPath } from '@/utils/redirect'

/**
 * Подтверждение кода — второй и обязательный шаг и входа, и регистрации.
 *
 * Что подтверждаем, страница берёт из `sessionStorage` (телефону не место в
 * адресе). Читается это через `useSyncExternalStore`, а не через
 * `useEffect` + `setState`: на сервере хранилища нет, а любой вариант с
 * «флагом смонтированности» — это синхронный `setState` в эффекте, который
 * здесь запрещён линтером и вызывает лишний каскад рендеров.
 */

/** Хранилище меняется только нашими же переходами — подписка не нужна. */
const subscribe = (): (() => void) => () => undefined

const serverSnapshot = (): null => null

const PendingMissing: React.FC = () => (
  <Alert tone="info" title="Нечего подтверждать">
    Начните с <AppLink href="/login">входа</AppLink> или{' '}
    <AppLink href="/register">регистрации</AppLink> — код придёт после них.
  </Alert>
)

const VerifyOtpPage: React.FC = () => {
  const router = useRouter()
  const { verifyOtp } = useAuth()
  const pending = useSyncExternalStore(subscribe, readPendingOtp, serverSnapshot)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (code: string): Promise<void> => {
    if (pending === null) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await verifyOtp({ phone: pending.phone, code, purpose: pending.purpose })
      clearPendingOtp()
      // Вход мог начаться с закрытой страницы — возвращаем туда, а не в каталог.
      await router.replace(safeRedirectPath(pending.next))
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось подтвердить код.')
      setIsSubmitting(false)
    }
  }

  const resendHref = pending?.purpose === 'REGISTER' ? '/register' : '/login'

  return (
    <SiteLayout>
      <Head>
        <title>Подтверждение — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate
        title="Подтвердите номер"
        subtitle="Введите шестизначный код из чата с ботом."
      >
        {pending === null ? (
          <PendingMissing />
        ) : (
          <>
            <OtpVerifyForm
              onSubmit={code => {
                void handleSubmit(code)
              }}
              isSubmitting={isSubmitting}
              error={error}
              hint={`Код отправлен на +996 ${formatNational(toNationalDigits(pending.phone))}`}
              resendAction={
                <Text size="sm" tone="secondary">
                  {/*
                    Повторная отправка — это тот же вход/регистрация: бэкенд шлёт код
                    только вместе с проверкой пароля, отдельной ручки resend нет.
                  */}
                  Код не пришёл? <AppLink href={resendHref}>Запросить заново</AppLink>
                </Text>
              }
            />

            <TelegramLinkPrompt botUsername={publicConfig('telegramBotUsername')} />
          </>
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default VerifyOtpPage
