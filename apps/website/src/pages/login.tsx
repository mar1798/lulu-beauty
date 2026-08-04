import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { ILoginValues } from 'widgets/types'
import { AppLink, Spinner, Text } from 'widgets/atoms'
import { LoginForm } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated'
import { isApiError } from '@/services/apiErrors'
import { savePendingOtp } from '@/utils/otpSession'

/**
 * Вход. Пара логин/пароль проверяется бэкендом, но сессию не открывает:
 * в ответ приходит только «код отправлен», а токены выдаст `/verify-otp`.
 */
const LoginPage: React.FC = () => {
  const router = useRouter()
  const { login } = useAuth()
  const isRedirecting = useRedirectIfAuthenticated()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: ILoginValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const purpose = await login(values)

      savePendingOtp({ phone: values.phone, purpose })
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
          <Text size="sm" tone="secondary">
            Ещё нет аккаунта? <AppLink href="/register">Зарегистрироваться</AppLink>
          </Text>
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
