import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IForgotPasswordValues } from 'widgets/types'
import { AppLink, Text } from 'widgets/atoms'
import { ForgotPasswordForm } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isApiError } from '@/services/apiErrors'
import { savePendingOtp } from '@/utils/otpSession'

const NOT_FOUND = 404

/**
 * Первый шаг восстановления пароля: только телефон. Код на смену пароля
 * шлёт `POST /auth/forgot-password`, а вводится он уже на `/reset-password`
 * — том же самом двухшаговом паттерне, что и вход/регистрация.
 */
const ForgotPasswordPage: React.FC = () => {
  const router = useRouter()
  const { forgotPassword } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: IForgotPasswordValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const purpose = await forgotPassword(values)

      savePendingOtp({ phone: values.phone, purpose })
      await router.push('/reset-password')
    } catch (cause: unknown) {
      setError(
        isApiError(cause) && cause.status === NOT_FOUND
          ? 'Аккаунт с этим номером не найден.'
          : isApiError(cause)
            ? cause.message
            : 'Не удалось отправить код. Попробуйте ещё раз.'
      )
      setIsSubmitting(false)
    }
  }

  return (
    <SiteLayout>
      <Head>
        <title>Восстановление пароля — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate
        title="Забыли пароль?"
        subtitle="Укажите телефон, привязанный к аккаунту, — пришлём код в Telegram."
        footer={
          <Text size="sm" tone="secondary">
            Вспомнили пароль? <AppLink href="/login">Войти</AppLink>
          </Text>
        }
      >
        <ForgotPasswordForm
          onSubmit={values => {
            void handleSubmit(values)
          }}
          isSubmitting={isSubmitting}
          error={error}
        />
      </AuthTemplate>
    </SiteLayout>
  )
}

export default ForgotPasswordPage
