import React, { useState } from 'react'
import type { IWantedProductValues } from 'widgets/types'
import { WantedProductForm } from 'widgets/organisms'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { submitWantedProduct } from '@/services/endpoints/wanted'

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
 * Гостю форма показывает имя и телефон, вошедшему - нет: контакт бэкенд берёт
 * с аккаунта (`app/wanted/service.py`), и присланному в форме всё равно бы не
 * поверил. Пока сессия ещё проверяется (`isLoading`), человек считается гостем:
 * лишние два поля хуже, чем форма, которая на полсекунды переставляется.
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

  return (
    <WantedProductForm
      title={title}
      description={description}
      isSignedIn={user !== null}
      isCompact={isCompact}
      isSubmitting={isSubmitting}
      isSent={isSent}
      error={error}
      onSubmit={submit}
      className={className}
    />
  )
}
