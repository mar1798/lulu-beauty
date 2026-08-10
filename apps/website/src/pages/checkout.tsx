import React, { useState } from 'react'
import Head from 'next/head'
import { mutate as globalMutate } from 'swr'
import type { IOrder } from 'widgets/types'
import { Alert, Button, Text } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { CheckoutForm } from 'widgets/organisms'
import { ITEM_FORMS, orderNumber } from 'widgets/molecules'
import { pluralize } from 'widgets/utils'
import { CartTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import * as styles from '@/styles/layout.css'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { isApiError } from '@/services/apiErrors'
import { checkout } from '@/services/endpoints/orders'
import { ordersKey } from '@/services/swrKeys'

/**
 * Оформление заявки.
 *
 * После успеха бэкенд забирает позиции из корзины в заявку, поэтому корзина
 * перезагружается — иначе счётчик в шапке остался бы висеть. Список заявок
 * тоже ревалидируется, чтобы новая заявка была видна на `/orders` сразу.
 */
const CheckoutPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, isLoading, reload } = useCart()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<IOrder | null>(null)

  const handleSubmit = async (note: string | null): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      setOrder(await checkout(note ?? undefined))
      await reload()

      if (user !== null) {
        void globalMutate(ordersKey(user.id))
      }
    } catch (cause: unknown) {
      setError(isApiError(cause) ? cause.message : 'Не удалось отправить заявку.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (): React.ReactNode => {
    if (order !== null) {
      return (
        <>
          <Alert tone="success" title="Заявка принята">
            Мы передали её владельцу. После закрытия сбора с вами свяжутся по телефону.
          </Alert>

          {/* `items.length` — число позиций, а не штук: складывать количества здесь незачем. */}
          <Text tone="secondary">
            {`Номер заявки: ${orderNumber(order.id)} · ${pluralize(order.items.length, ITEM_FORMS)}`}
          </Text>

          <div className={styles.actions}>
            <Button link={{ href: `/orders/${order.id}` }}>Открыть заявку</Button>

            <Button link={{ href: '/catalog' }} variant="secondary">
              Вернуться в каталог
            </Button>
          </div>
        </>
      )
    }

    const isCartLoading = isAuthLoading || (user !== null && isLoading)

    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Нужен вход"
          description="Заявка оформляется на аккаунт — по нему владелец свяжется с вами."
          action={<Button link={{ href: '/login' }}>Войти</Button>}
        />
      )
    }

    if (!isCartLoading && (cart === null || cart.items.length === 0)) {
      return (
        <EmptyState
          title="Оформлять нечего"
          description="Соберите корзину — и возвращайтесь сюда."
          action={<Button link={{ href: '/catalog' }}>В каталог</Button>}
        />
      )
    }

    if (!isCartLoading && cart !== null && cart.cycleId === null) {
      return (
        <Alert tone="warning" title="Приём заявок закрыт">
          Сейчас нет открытого сбора. Корзина сохранится до следующего.
        </Alert>
      )
    }

    /*
      Пока корзина грузится, форма рисуется скелетоном в своей же раскладке:
      спиннер сменился бы формой другой высоты, и страница дёрнулась бы.
    */
    return (
      <CheckoutForm
        totalCents={cart?.totalCents ?? 0}
        itemCount={cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0}
        deadlineAt={cart?.cycleDeadlineAt ?? null}
        isLoading={isCartLoading}
        isSubmitting={isSubmitting}
        error={error}
        onSubmit={note => {
          void handleSubmit(note)
        }}
      />
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Оформление заявки — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CartTemplate
        title={order === null ? 'Оформление заявки' : 'Заявка отправлена'}
        summary={
          order === null
            ? 'Проверьте состав и добавьте комментарий, если он нужен.'
            : undefined
        }
      >
        {content()}
      </CartTemplate>
    </SiteLayout>
  )
}

export default CheckoutPage
