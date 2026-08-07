import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { ILoginValues } from 'widgets/types'
import { AppLink, Spinner, Text } from 'widgets/atoms'
import { LoginForm } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import * as authFooterStyles from '@/styles/authFooter.css'
import { useAuth } from '@/contexts/AuthContext'
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated'
import { isApiError } from '@/services/apiErrors'
import { savePendingOtp } from '@/utils/otpSession'
import { safeRedirectPath } from '@/utils/redirect'

/**
 * Вход. Пара логин/пароль проверяется бэкендом, но сессию не открывает:
 * в ответ приходит только «код отправлен», а токены выдаст `/verify-otp`.
 */
const LoginPage: React.FC = () => {
  const router = useRouter()
  const { login } = useAuth()
  // Сюда уводит гейт админки: `/admin/*` у гостя даёт `/login?next=/admin/...`.
  const next = safeRedirectPath(router.query.next)
  const isRedirecting = useRedirectIfAuthenticated(next)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: ILoginValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const purpose = await login(values)

      savePendingOtp({ phone: values.phone, purpose, next })
      await router.push('/verify-otp')
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось войти. Попробуйте ещё раз.')
      setIsSubmitting(false)
    }
  }

  return (
    <SiteLayout>
      <Head>
        <title>Вход — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate
        title="Вход"
        subtitle="Введите телефон и пароль — код подтверждения придёт в Telegram."
        footer={
          <div className={authFooterStyles.stack}>
            <Text size="sm" tone="secondary">
              Ещё нет аккаунта? <AppLink href="/register">Зарегистрироваться</AppLink>
            </Text>
            <Text size="sm" tone="secondary">
              <AppLink href="/forgot-password">Забыли пароль?</AppLink>
            </Text>
          </div>
        }
      >
        {isRedirecting ? (
          <Spinner label="Проверяем сессию" />
        ) : (
          <LoginForm
            onSubmit={values => {
              void handleSubmit(values)
            }}
            isSubmitting={isSubmitting}
            error={error}
          />
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default LoginPage
