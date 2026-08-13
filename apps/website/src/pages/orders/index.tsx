import React from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { IOrder } from 'widgets/types'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { OrderList } from 'widgets/organisms'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { listMyOrders } from '@/services/endpoints/orders'
import { ordersKey } from '@/services/swrKeys'

/**
 * Мои заявки.
 *
 * Приватная и клиентская: заявки идут через прокси, отдавать их статикой
 * нечего. Гостя не редиректим — как и в корзине, предлагаем войти, чтобы
 * переход из шапки не выглядел ошибкой.
 */
const OrdersPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const userId = user?.id ?? null

  // Ключ с идентификатором аккаунта — чужие заявки не залипнут при смене входа.
  const {
    data: orders,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR<IOrder[]>(userId === null ? null : ordersKey(userId), () => listMyOrders())

  const error = fetchError === undefined ? null : messageForError(fetchError, 'order.load')

  const content = (): React.ReactNode => {
    // Пока сессия не проверена, «войдите» показывать нельзя: у залогиненного
    // это была бы вспышка чужого экрана вместо его собственных заявок.
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Заявки видны после входа"
          description="Войдите — и здесь появится история ваших заявок по сборам."
          action={<Button link={{ href: '/login' }}>Войти</Button>}
        />
      )
    }

    if (error !== null) {
      return (
        <Alert
          tone="danger"
          title="Не получилось"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void mutate()
              }}
            >
              Повторить
            </Button>
          }
        >
          {error}
        </Alert>
      )
    }

    return (
      <OrderList
        orders={orders ?? []}
        isLoading={isAuthLoading || isLoading}
        buildHref={order => `/orders/${order.id}`}
        emptyState={
          <EmptyState
            title="Заявок пока нет"
            description="Соберите корзину и оформите заявку — она появится здесь."
            action={<Button link={{ href: '/catalog' }}>В каталог</Button>}
          />
        }
      />
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Мои заявки — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Мои заявки"
        summary="Состав и цены сохраняются такими, какими были в момент оформления."
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/orders"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default OrdersPage
