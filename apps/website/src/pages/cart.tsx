import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { CartPanel } from 'widgets/organisms'
import { CartTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'

/**
 * Корзина. Приватная и целиком клиентская: данные идут через прокси,
 * статикой её отдавать нечего.
 *
 * Гостя не редиректим, а показываем предложение войти: корзина на бэкенде
 * привязана к пользователю, и внезапный переход на `/login` из шапки
 * выглядел бы как ошибка.
 */
const CartPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, isLoading, isBusy, error, updateItem, removeItem } = useCart()

  const content = (): React.ReactNode => {
    // Пока сессия не проверена, «войдите» показывать нельзя: у залогиненного
    // это была бы вспышка чужого экрана вместо его корзины.
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Корзина у каждого своя"
          description="Войдите, чтобы собрать заявку — она сохранится до закрытия сбора."
          action={<Button link={{ href: '/login' }}>Войти</Button>}
        />
      )
    }

    return (
      <CartPanel
        cart={cart}
        // Скелетон, а не спиннер: раскладка корзины известна заранее, и
        // подменять её кружком значит переложить страницу дважды.
        isLoading={isAuthLoading || isLoading}
        isBusy={isBusy}
        error={error}
        buildProductHref={slug => `/catalog/${slug}`}
        onQuantityChange={(productId, quantity) => {
          void updateItem(productId, quantity)
        }}
        onRemove={productId => {
          void removeItem(productId)
        }}
        onCheckout={() => {
          void router.push('/checkout')
        }}
        emptyState={
          <EmptyState
            title="Пока пусто"
            description="Загляните в каталог — товары появляются перед каждым сбором."
            action={<Button link={{ href: '/catalog' }}>В каталог</Button>}
          />
        }
      />
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Корзина — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CartTemplate
        title="Корзина"
        summary="Оплата не проводится: это заявка, которую владелец подтвердит после закрытия сбора."
      >
        {content()}
      </CartTemplate>
    </SiteLayout>
  )
}

export default CartPage
