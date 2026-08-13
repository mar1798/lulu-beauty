import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Button, Text } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { ProfileForm, TelegramLinkPrompt } from 'widgets/organisms'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { publicConfig } from '@/сonfig'

/**
 * Профиль: имя, номер, привязка Telegram, выход.
 *
 * Менять можно только имя — `PATCH /users/me` другого и не принимает.
 * Привязка Telegram здесь же, потому что это единственный экран, куда
 * человек вернётся, если не довёл её до конца при регистрации.
 */
const AccountPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading, updateProfile, logout } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleSubmit = async (name: string): Promise<void> => {
    setIsSubmitting(true)
    setError(null)
    setIsSaved(false)

    try {
      await updateProfile(name)
      setIsSaved(true)
    } catch (cause: unknown) {
      setError(messageForError(cause, 'account.save'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true)

    try {
      await logout()
      await router.push('/catalog')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const content = (): React.ReactNode => {
    /*
      Скелетон в раскладке формы: спиннер сменился бы блоком другой высоты.
      Обработчик тот же самый — в этом состоянии формы ещё нет и нажимать
      нечего, а заводить ради него пустышку смысла нет.
    */
    if (isLoading) {
      return (
        <ProfileForm
          user={null}
          isLoading={true}
          onSubmit={name => {
            void handleSubmit(name)
          }}
        />
      )
    }

    if (user === null) {
      return (
        <EmptyState
          title="Профиль виден после входа"
          description="Войдите — и здесь можно будет поправить имя и привязать Telegram."
          action={<Button link={{ href: '/login' }}>Войти</Button>}
        />
      )
    }

    return (
      <>
        {/*
          `key` по id: при смене аккаунта форма пересоздаётся, и в поле не
          остаётся имя предыдущего пользователя.
        */}
        <ProfileForm
          key={user.id}
          user={user}
          onSubmit={name => {
            void handleSubmit(name)
          }}
          isSubmitting={isSubmitting}
          error={error}
          isSaved={isSaved}
          footer={
            <>
              <Text size="sm" tone="muted">
                Выход завершает сессию на этом устройстве. Корзина и заявки сохранятся.
              </Text>

              <Button
                variant="secondary"
                isLoading={isLoggingOut}
                onClick={() => {
                  void handleLogout()
                }}
              >
                Выйти из аккаунта
              </Button>
            </>
          }
        />

        <TelegramLinkPrompt
          botUsername={publicConfig('telegramBotUsername')}
          isLinked={user.telegramLinked}
        />
      </>
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Профиль — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Профиль"
        summary="Имя видит владелец, когда собирает заказ по вашей заявке."
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/account"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default AccountPage
