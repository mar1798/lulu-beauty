import React, { useState, useSyncExternalStore } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IResetPasswordValues } from 'widgets/types'
import { Alert, AppLink, Text, formatNational, toNationalDigits } from 'widgets/atoms'
import { ResetPasswordForm } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError } from '@/services/apiErrors'
import { clearPendingOtp, readPendingOtp } from '@/utils/otpSession'
import { safeRedirectPath } from '@/utils/redirect'

/**
 * Второй и последний шаг восстановления пароля: код из Telegram и новый
 * пароль разом. Что подтверждаем (телефон), как и на `/verify-otp`, лежит
 * в `sessionStorage`, а не в адресе — см. комментарий там.
 */

const subscribe = (): (() => void) => () => undefined

const serverSnapshot = (): null => null

const PendingMissing: React.FC = () => (
  <Alert tone="info" title="Нечего подтверждать">
    Начните с <AppLink href="/forgot-password">восстановления пароля</AppLink> — код придёт
    после него.
  </Alert>
)

const ResetPasswordPage: React.FC = () => {
  const router = useRouter()
  const { resetPassword } = useAuth()
  const pending = useSyncExternalStore(subscribe, readPendingOtp, serverSnapshot)
  const isPending = pending !== null && pending.purpose === 'RESET_PASSWORD'

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: IResetPasswordValues): Promise<void> => {
    if (!isPending) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await resetPassword({ phone: pending.phone, code: values.code, newPassword: values.password })
      clearPendingOtp()
      await router.replace(safeRedirectPath(pending.next))
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось сменить пароль.')
      setIsSubmitting(false)
    }
  }

  return (
    <SiteLayout>
      <Head>
        <title>Новый пароль — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate title="Придумайте новый пароль" subtitle="Введите код из Telegram и новый пароль.">
        {!isPending ? (
          <PendingMissing />
        ) : (
          <ResetPasswordForm
            onSubmit={values => {
              void handleSubmit(values)
            }}
            isSubmitting={isSubmitting}
            error={error}
            hint={`Код отправлен на +996 ${formatNational(toNationalDigits(pending.phone))}`}
            resendAction={
              <Text size="sm" tone="secondary">
                Код не пришёл? <AppLink href="/forgot-password">Запросить заново</AppLink>
              </Text>
            }
          />
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default ResetPasswordPage
