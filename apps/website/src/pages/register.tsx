import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IRegisterValues } from 'widgets/types'
import { AppLink, Spinner, Text } from 'widgets/atoms'
import { RegisterForm, TelegramLinkPrompt } from 'widgets/organisms'
import { AuthTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated'
import { isApiError } from '@/services/apiErrors'
import { publicConfig } from '@/сonfig'
import { savePendingOtp } from '@/utils/otpSession'
import { safeRedirectPath } from '@/utils/redirect'

/**
 * Регистрация. Инструкция по Telegram стоит рядом с формой, а не только на
 * следующем экране: без привязки бот не сможет прислать код, и человек
 * упрётся в это уже после отправки формы.
 */
const RegisterPage: React.FC = () => {
  const router = useRouter()
  const { register } = useAuth()
  // Регистрация тоже может начаться с закрытой страницы — адрес возврата тот же.
  const next = safeRedirectPath(router.query.next)
  const isRedirecting = useRedirectIfAuthenticated(next)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (values: IRegisterValues): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      const purpose = await register(values)

      savePendingOtp({ phone: values.phone, purpose, next })
      await router.push('/verify-otp')
    } catch (cause: unknown) {
      setError(
        isApiError(cause) ? cause.message : 'Не удалось зарегистрироваться. Попробуйте ещё раз.'
      )
      setIsSubmitting(false)
    }
  }

  return (
    <SiteLayout>
      <Head>
        <title>Регистрация — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AuthTemplate
        title="Регистрация"
        subtitle="Заявки собираются по телефону, а подтверждение приходит в Telegram."
        footer={
          <Text size="sm" tone="secondary">
            Уже есть аккаунт? <AppLink href="/login">Войти</AppLink>
          </Text>
        }
      >
        {isRedirecting ? (
          <Spinner label="Проверяем сессию" />
        ) : (
          <>
            <RegisterForm
              onSubmit={values => {
                void handleSubmit(values)
              }}
              isSubmitting={isSubmitting}
              error={error}
            />

            <TelegramLinkPrompt botUsername={publicConfig('telegramBotUsername')} />
          </>
        )}
      </AuthTemplate>
    </SiteLayout>
  )
}

export default RegisterPage
