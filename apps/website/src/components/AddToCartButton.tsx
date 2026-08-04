import React from 'react'
import { useRouter } from 'next/router'
import type { IControlSize } from 'widgets/types'
import { Button } from 'widgets/atoms'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'

/**
 * Кнопка «В корзину» для карточки и страницы товара.
 *
 * Живёт в `apps/website`, а не в `widgets`: ей нужны и корзина, и сессия, и
 * роутер. В виджетах для неё оставлены слоты (`action`/`renderAction`).
 *
 * Гостя отправляем на вход, а не показываем ошибку: корзина на бэкенде
 * привязана к пользователю, анонимной корзины не существует.
 */
export const AddToCartButton: React.FC<{
  productId: string
  size?: IControlSize
  isFullWidth?: boolean
  disabled?: boolean
}> = ({ productId, size = 'sm', isFullWidth = false, disabled = false }) => {
  const router = useRouter()
  const { user } = useAuth()
  const { cart, addItem, isBusy } = useCart()

  const isInCart = cart?.items.some(item => item.productId === productId) === true

  if (isInCart) {
    return (
      <Button variant="secondary" size={size} isFullWidth={isFullWidth} link={{ href: '/cart' }}>
        В корзине
      </Button>
    )
  }

  return (
    <Button
      size={size}
      isFullWidth={isFullWidth}
      disabled={disabled}
      isLoading={isBusy}
      onClick={() => {
        if (user === null) {
          void router.push('/login')
          return
        }

        void addItem(productId)
      }}
    >
      В корзину
    </Button>
  )
}
