import React, { useState } from 'react'
import { useRouter } from 'next/router'
import type { IWantedProductValues } from 'widgets/types'
import { WantedProductForm } from 'widgets/organisms'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { submitWantedProduct } from '@/services/endpoints/wanted'
import { INSTAGRAM_URL } from '@/utils/contacts'

/**
 * Форма пожелания, подключённая к API.
 *
 * Виджет (`WantedProductForm`) презентационный: он собирает поля и отдаёт их
 * наружу. Отправка, сессия и разбор ошибки живут здесь - как у `CatalogSearch`
 * с `HeaderSearch`.
 *
 * Про сбор не спрашивает ничего и намеренно: пожелание пишут как раз тогда,
 * когда в каталоге пусто, а сбора может не быть вовсе.
 *
 * Пожелание оставляют только вошедшие: контакт для ответа бэкенд берёт с
 * аккаунта (`app/wanted/service.py`). Гостю виджет показывает кнопку входа, и
 * она ведёт на `/login` с возвратом сюда же - как сердце `WishlistButton`.
 * Пока сессия ещё проверяется (`isLoading`), человек считается гостем: кнопка,
 * которая на полсекунды сменяется полем, лучше поля, которое отправит 401.
 *
 * `isSent` не сбрасывается: отправленное пожелание - конец разговора, а вторую
 * копию того же текста владельцу слать незачем. Новая форма появится сама -
 * вместе со следующим пустым поиском, который её и смонтирует заново.
 */
export const WantedProductPrompt: React.FC<{
  title?: string
  description?: string
  /** Тесная раскладка - под пустой выдачей поиска в шапке. */
  isCompact?: boolean
  className?: string
}> = ({ title, description, isCompact = false, className }) => {
  const router = useRouter()
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (values: IWantedProductValues): void => {
    setIsSubmitting(true)
    setError(null)

    void submitWantedProduct(values)
      .then(() => {
        setIsSent(true)
      })
      .catch((cause: unknown) => {
        setError(messageForError(cause, 'catalog.wanted'))
      })
      .finally(() => {
        setIsSubmitting(false)
      })
  }

  const signIn = (): void => {
    void router.push({ pathname: '/login', query: { next: router.asPath } })
  }

  return (
    <WantedProductForm
      title={title}
      description={description}
      isSignedIn={user !== null}
      onSignIn={signIn}
      contact={{ label: 'Instagram', link: { href: INSTAGRAM_URL, target: '_blank' } }}
      isCompact={isCompact}
      isSubmitting={isSubmitting}
      isSent={isSent}
      error={error}
      onSubmit={submit}
      className={className}
    />
  )
}
