import React, { useState } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import { Alert, Button } from 'widgets/atoms'
import { EmptyState, Pagination } from 'widgets/molecules'
import { OrderList } from 'widgets/organisms'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { messageForError } from '@/services/apiErrors'
import { listMyOrders, MY_ORDERS_PAGE_SIZE } from '@/services/endpoints/orders'
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
  const [page, setPage] = useState(1)

  // Ключ с идентификатором аккаунта — чужие заявки не залипнут при смене входа.
  const {
    data,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(
    userId === null ? null : ordersKey(userId, page),
    () => listMyOrders({ page, pageSize: MY_ORDERS_PAGE_SIZE }),
    // Перелистывание не должно ронять список в скелетон — как в админском списке заявок.
    { keepPreviousData: true }
  )

  const error = fetchError === undefined ? null : messageForError(fetchError, 'order.load')

  const content = (): React.ReactNode => {
    // Пока сессия не проверена, «войдите» показывать нельзя: у залогиненного
    // это была бы вспышка чужого экрана вместо его собственных заявок.
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Заявки видны после входа"
          description="Войдите — и здесь появится история ваших заявок по сборам."
          action={
            <Button link={{ href: '/login' }} isFullWidth="mobile">
              Войти
            </Button>
          }
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
      <>
        <OrderList
          orders={data?.items ?? []}
          // `keepPreviousData` оставляет прошлую страницу на экране, поэтому
          // скелетон нужен только пока показывать вообще нечего.
          isLoading={(isAuthLoading || isLoading) && data === undefined}
          buildHref={order => `/orders/${order.id}`}
          emptyState={
            <EmptyState
              title="Заявок пока нет"
              description="Соберите корзину и оформите заявку — она появится здесь."
              action={
                <Button link={{ href: '/catalog' }} isFullWidth="mobile">
                  В каталог
                </Button>
              }
            />
          }
        />

        {data !== undefined && data.total > MY_ORDERS_PAGE_SIZE && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onChange={setPage}
          />
        )}
      </>
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
