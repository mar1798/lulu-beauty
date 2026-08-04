import React, { useMemo } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IOrder, IOrderCycle } from 'widgets/types'
import { Alert, Button, Spinner } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { OrderDetails } from 'widgets/organisms'
import { AccountTemplate } from 'widgets/templates'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { useAuthedRequest } from '@/hooks/useAuthedRequest'
import { getActiveCycleOrNull } from '@/services/endpoints/cycles'
import { getMyOrder } from '@/services/endpoints/orders'

/**
 * Одна заявка покупателя.
 *
 * Чужая заявка отдаёт с бэкенда 404 (`get_for_user` фильтрует по владельцу),
 * поэтому «не найдена» и «не ваша» здесь намеренно один и тот же экран:
 * подтверждать существование чужой заявки незачем.
 *
 * Активный сбор запрашивается отдельно — у `OrderResponse` есть только
 * `cycleId`, а публичной ручки «цикл по id» на бэкенде нет.
 */

const NOT_FOUND = 404

const OrderPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()

  const userId = user?.id ?? null
  const orderId = typeof router.query.id === 'string' ? router.query.id : null

  const loadOrder = useMemo(
    () =>
      userId === null || orderId === null ? null : (): Promise<IOrder> => getMyOrder(orderId),
    [userId, orderId]
  )

  const loadCycle = useMemo(
    () => (userId === null ? null : (): Promise<IOrderCycle | null> => getActiveCycleOrNull()),
    [userId]
  )

  const { data: order, isLoading, error, status } = useAuthedRequest(
    loadOrder,
    'Не удалось загрузить заявку.'
  )

  // Сбор — справочная деталь: его ошибку молча игнорируем, заявка важнее.
  const { data: cycle } = useAuthedRequest(loadCycle, '')

  const content = (): React.ReactNode => {
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Заявка видна после входа"
          description="Войдите тем же номером, с которого её оформляли."
          action={<Button link={{ href: '/login' }}>Войти</Button>}
        />
      )
    }

    if (isAuthLoading || isLoading || orderId === null) {
      return <Spinner label="Загружаем заявку" />
    }

    if (status === NOT_FOUND) {
      return (
        <EmptyState
          title="Заявка не найдена"
          description="Возможно, ссылка устарела или заявка оформлена на другой аккаунт."
          action={<Button link={{ href: '/orders' }}>К моим заявкам</Button>}
        />
      )
    }

    if (error !== null || order === null) {
      return (
        <Alert tone="danger" title="Не получилось">
          {error ?? 'Не удалось загрузить заявку.'}
        </Alert>
      )
    }

    return (
      <OrderDetails
        order={order}
        buildProductHref={slug => `/catalog/${slug}`}
        isCurrentCycle={cycle !== null && cycle.id === order.cycleId}
      />
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Заявка — Lulu Beauty</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Заявка"
        summary="Поданную заявку изменить нельзя — по вопросам к составу владелец свяжется с вами."
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/orders"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default OrderPage
