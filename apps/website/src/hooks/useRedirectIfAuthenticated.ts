import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Уводит уже вошедшего пользователя со страниц входа и регистрации.
 *
 * Ждёт окончания первой проверки сессии (`isLoading`): до неё `user === null`
 * означает «ещё не знаем», а не «гость», и редирект сработал бы вхолостую.
 */
export const useRedirectIfAuthenticated = (destination = '/catalog'): boolean => {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && user !== null) {
      void router.replace(destination)
    }
  }, [isLoading, user, router, destination])

  return isLoading || user !== null
}
