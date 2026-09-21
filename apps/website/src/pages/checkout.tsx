import React, { useState } from 'react'
import Head from 'next/head'
import { mutate as globalMutate } from 'swr'
import type { IOrder } from 'widgets/types'
import { Alert, AppLink, Button, Text } from 'widgets/atoms'
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
import { addMyOrderItem, checkout } from '@/services/endpoints/orders'
import { isOrdersKey } from '@/services/swrKeys'

/**
 * Оформление заявки.
 *
 * После успеха бэкенд забирает позиции из корзины в заявку, поэтому корзина
 * перезагружается — иначе счётчик в шапке остался бы висеть. Список заявок
 * тоже ревалидируется, чтобы новая заявка была видна на `/orders` сразу.
 *
 * Количество правится здесь же степперами (удаление — только в корзине, см.
 * `CheckoutPanel`). Перед отправкой ждём `settled()`: количество применяется
 * оптимистично, а `checkout` идёт мимо очереди изменений корзины — иначе `+`
 * и сразу «Отправить» дали бы заявку прежнего состава.
 *
 * Забытый товар добавляется здесь же — тем же `ProductPicker`, что и в уже
 * поданной заявке. Разница только в получателе: до отправки товар кладётся в
 * корзину (заявки ещё нет), после — прямо в заявку (`POST /orders/{id}/items`),
 * не создавая вторую. Экран успеха поэтому не тупик: подборщик остаётся на
 * нём, пока бэкенд считает заявку правимой (`isEditable`), — вспоминают
 * забытое чаще всего ровно после отправки, и уводить за этим на `/orders/[id]`
 * значит терять только что поданную заявку из виду.
 */
const CheckoutPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, isLoading, reload, addItem, updateItem, settled } = useCart()
  const { notify } = useToast()
  const search = useProductSearch()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<IOrder | null>(null)
  /** Идёт добавление: подборщик блокируется целиком, чтобы не задвоить товар. */
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async (variantId: string): Promise<void> => {
    setIsAdding(true)

    const result = await addItem(variantId)

    setIsAdding(false)

    notify(
      result.ok
        ? { tone: 'success', title: 'Товар добавлен' }
        : { tone: 'danger', title: 'Не получилось', description: result.error ?? undefined }
    )
  }

  /**
   * Правка количества до отправки.
   *
   * Экран оформления ошибку корзины нигде не показывает (`error` под формой —
   * про саму отправку), поэтому осечка уходит тостом, как и у дозаказа. Число
   * при этом откатывается само: откат оптимистичного слепка делает
   * `CartContext`.
   */
  const handleQuantityChange = async (variantId: string, quantity: number): Promise<void> => {
    const result = await updateItem(variantId, quantity)

    if (!result.ok) {
      notify({
        tone: 'danger',
        title: 'Количество не изменилось',
        description: result.error ?? undefined,
      })
    }
  }

  /**
   * Добавление в уже поданную заявку — с экрана успеха.
   *
   * Ручка возвращает заявку целиком, поэтому состав и номер на экране берутся
   * из ответа: количество позиций пересчитывает сервер (объём, который в
   * заявке уже есть, сливается со своей строкой, а не заводит вторую).
   */
  const handleAddToOrder = async (orderId: string, variantId: string): Promise<void> => {
    setIsAdding(true)

    try {
      setOrder(await addMyOrderItem(orderId, variantId))
      // Список заявок показывает состав — там та же заявка уже другая.
      void globalMutate(isOrdersKey)
      notify({ tone: 'success', title: 'Товар добавлен в заявку' })
    } catch (cause: unknown) {
      notify({
        tone: 'danger',
        title: 'Не получилось',
        description: messageForError(cause, 'order.item.add'),
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleSubmit = async (note: string | null): Promise<void> => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Сервер снимает заявку с корзины — сперва пусть корзина догонит экран.
      await settled()

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
          {/*
            Номер над врезкой, а не под ней: это опознавательный знак заявки —
            по нему её называют владельцу, — и искать его после абзаца про
            подтверждение значит читать абзац целиком.

            `items.length` — число позиций, а не штук: складывать количества
            здесь незачем.
          */}
          <Text tone="secondary">
            {`Номер заявки: ${orderNumber(order.id)} · ${pluralize(order.items.length, ITEM_FORMS)}`}
          </Text>

          <Alert tone="success" title="Заявка принята">
            Мы её получили. После закрытия сбора подтвердим заявку — уведомление придёт в Telegram,
            а о выдаче договоримся лично.
            {order.isEditable && (
              <>
                {' Пока сбор открыт, заявку можно дополнить — добавьте товар прямо здесь или на '}
                <AppLink href={`/orders/${order.id}`} className={styles.alertLink}>
                  странице заявки
                </AppLink>
                {', второй заявки для этого не нужно.'}
              </>
            )}
          </Alert>

          {/*
            Правимость решает бэкенд: между отправкой и этим кадром сбор мог
            закрыться, а владелец — подтвердить заявку. Обещать добавление,
            которое вернёт 409, хуже, чем не обещать его вовсе.
          */}
          {order.isEditable && (
            <ProductPicker
              query={search.query}
              onQueryChange={search.setQuery}
              products={search.products}
              isSearching={search.isSearching}
              error={search.error}
              addedVariantIds={order.items
                .map(item => item.variantId)
                .filter((variantId): variantId is string => variantId !== null)}
              onAdd={variantId => {
                void handleAddToOrder(order.id, variantId)
              }}
              isBusy={isAdding}
              label="Забыли что-то? Добавьте в эту же заявку"
              className={styles.flushPicker}
            />
          )}

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
          description="Заявка оформляется на аккаунт — в привязанный к нему чат придёт подтверждение"
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
          description="Соберите корзину — и возвращайтесь сюда"
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
          /*
            Степперы замирают только под отправкой: под собственный запрос
            гасить их нельзя — быстрые нажатия должны складываться.
          */
          isBusy={isSubmitting}
          onQuantityChange={(variantId, quantity) => {
            void handleQuantityChange(variantId, quantity)
          }}
          addItem={
            <ProductPicker
              query={search.query}
              onQueryChange={search.setQuery}
              products={search.products}
              isSearching={search.isSearching}
              error={search.error}
              addedVariantIds={cart?.items.map(item => item.variantId) ?? []}
              addedLabel="Уже в корзине"
              onAdd={variantId => {
                void handleAdd(variantId)
              }}
              isBusy={isAdding || isSubmitting}
              label="Проверьте — возможно, вы что-то забыли"
              hint="Найденный товар попадёт в корзину и уйдёт в эту же заявку"
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

  /*
    Подпись шапки: до отправки — про состав и комментарий, после — про то, что
    заявка ещё открыта для правок. Молчать на экране успеха значило бы прятать
    главное: подать вторую заявку взамен дополнения — самая дорогая ошибка,
    потому что сводит их владелец руками.
  */
  const orderSummary = (): string | undefined => {
    if (order === null) {
      return 'Проверьте состав и добавьте комментарий, если он нужен'
    }

    return order.isEditable
      ? 'Пока сбор открыт и заявка не подтверждена, в неё можно добавить товар — новая заявка не нужна'
      : undefined
  }

  return (
    <SiteLayout>
      <Head>
        <title>Оформление заявки — Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CartTemplate
        title={order === null ? 'Оформление заявки' : 'Заявка отправлена'}
        summary={orderSummary()}
      >
        {content()}
      </CartTemplate>
    </SiteLayout>
  )
}

export default CheckoutPage
