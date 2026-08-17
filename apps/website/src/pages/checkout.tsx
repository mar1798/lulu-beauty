import React, { useState } from 'react'
import Head from 'next/head'
import { mutate as globalMutate } from 'swr'
import type { IOrder } from 'widgets/types'
import { Alert, Button, Text } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { CheckoutForm, CheckoutPanel, ProductPicker } from 'widgets/organisms'
import { ITEM_FORMS, orderNumber } from 'widgets/molecules'
import { useToast } from 'widgets/contexts'
import { pluralize } from 'widgets/utils'
import { CartTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { EditableOrderNotice } from '@/components/EditableOrderNotice'
import * as styles from '@/styles/layout.css'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useProductSearch } from '@/hooks/useProductSearch'
import { messageForError } from '@/services/apiErrors'
import { checkout } from '@/services/endpoints/orders'
import { isOrdersKey } from '@/services/swrKeys'

/**
 * Оформление заявки.
 *
 * После успеха бэкенд забирает позиции из корзины в заявку, поэтому корзина
 * перезагружается — иначе счётчик в шапке остался бы висеть. Список заявок
 * тоже ревалидируется, чтобы новая заявка была видна на `/orders` сразу.
 *
 * Забытый товар добавляется здесь же — тем же `ProductPicker`, что и в уже
 * поданной заявке. Разница только в получателе: до отправки товар кладётся в
 * корзину (заявки ещё нет), после — прямо в заявку (`/orders/[id]`).
 */
const CheckoutPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, isLoading, reload, addItem } = useCart()
  const { notify } = useToast()
  const search = useProductSearch()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<IOrder | null>(null)
  /** Идёт добавление: подборщик блокируется целиком, чтобы не задвоить товар. */
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async (productId: string): Promise<void> => {
    setIsAdding(true)

    const result = await addItem(productId)

    setIsAdding(false)

    notify(
      result.ok
        ? { tone: 'success', title: 'Товар добавлен' }
        : { tone: 'danger', title: 'Не получилось', description: result.error ?? undefined }
    )
  }

  const handleSubmit = async (note: string | null): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      setOrder(await checkout(note ?? undefined))
      await reload()

      if (user !== null) {
        // Все страницы списка: новая заявка встаёт первой и сдвигает остальные.
        void globalMutate(isOrdersKey)
      }
    } catch (cause: unknown) {
      setError(messageForError(cause, 'checkout'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (): React.ReactNode => {
    if (order !== null) {
      return (
        <>
          <Alert tone="success" title="Заявка принята">
            Мы передали её владельцу. После закрытия сбора он подтвердит заявку —
            уведомление придёт в Telegram, а о выдаче договоритесь лично.
          </Alert>

          {/* `items.length` — число позиций, а не штук: складывать количества здесь незачем. */}
          <Text tone="secondary">
            {`Номер заявки: ${orderNumber(order.id)} · ${pluralize(order.items.length, ITEM_FORMS)}`}
          </Text>

          <div className={styles.actions}>
            <Button link={{ href: `/orders/${order.id}` }} isFullWidth="mobile">
              Открыть заявку
            </Button>

            <Button link={{ href: '/catalog' }} variant="secondary" isFullWidth="mobile">
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
          description="Заявка оформляется на аккаунт — в привязанный к нему чат придёт подтверждение."
          action={
            <Button link={{ href: '/login' }} isFullWidth="mobile">
              Войти
            </Button>
          }
        />
      )
    }

    if (!isCartLoading && (cart === null || cart.items.length === 0)) {
      return (
        <EmptyState
          title="Оформлять нечего"
          description="Соберите корзину — и возвращайтесь сюда."
          action={
            <Button link={{ href: '/catalog' }} isFullWidth="mobile">
              В каталог
            </Button>
          }
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
      Пока корзина грузится, и состав, и форма рисуются скелетонами в своих же
      раскладках: спиннер сменился бы содержимым другой высоты, и страница
      дёрнулась бы.
    */
    return (
      <>
        {/* Врезка над составом: решение «добавить в открытую заявку» принимают
            до отправки, а не после. */}
        <EditableOrderNotice />

        <CheckoutPanel
          cart={cart}
          buildProductHref={slug => `/catalog/${slug}`}
          cartHref="/cart"
          isLoading={isCartLoading}
          addItem={
            <ProductPicker
              query={search.query}
              onQueryChange={search.setQuery}
              products={search.products}
              isSearching={search.isSearching}
              error={search.error}
              addedProductIds={cart?.items.map(item => item.productId) ?? []}
              addedLabel="Уже в корзине"
              onAdd={productId => {
                void handleAdd(productId)
              }}
              isBusy={isAdding || isSubmitting}
              label="Проверьте — возможно, вы что-то забыли"
              hint="Найденный товар попадёт в корзину и уйдёт в эту же заявку."
            />
          }
          form={
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
          }
        />
      </>
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
