import React, { useCallback } from 'react'
import Head from 'next/head'
import useSWR from 'swr'
import type { IPromoCode } from 'widgets/types'
import { Alert, Button, Skeleton } from 'widgets/atoms'
import { EmptyState, PromoCodeCard } from 'widgets/molecules'
import { AccountTemplate } from 'widgets/templates'
import { useToast } from 'widgets/contexts'
import { SiteLayout } from '@/layouts/SiteLayout'
import { ACCOUNT_NAVIGATION } from '@/layouts/accountNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { useLoginHref } from '@/hooks/useLoginHref'
import { messageForError } from '@/services/apiErrors'
import { listMyPromoCodes } from '@/services/endpoints/promotions'
import { promoCodesKey } from '@/services/swrKeys'
import * as styles from '@/styles/layout.css'

/**
 * Промокоды покупателя: выданные за акции, с копированием и статусом.
 *
 * Приватная и клиентская, как «Мои заявки»: гостя не уводим, а предлагаем войти.
 * Статус каждого кода считает сервер (`EXPIRED` - по сроку на момент ответа), здесь
 * он только показан. Порядок: сначала те, что можно применить, затем остальные -
 * внутри групп остаётся серверный (новые выше).
 */

const SKELETON_CARDS = 2
const USABLE: ReadonlySet<IPromoCode['status']> = new Set(['ACTIVE', 'RESERVED'])

/** Применимые коды вперёд; сортировка устойчива, порядок внутри группы сохраняется. */
const usableFirst = (codes: readonly IPromoCode[]): IPromoCode[] => [
  ...codes.filter(code => USABLE.has(code.status)),
  ...codes.filter(code => !USABLE.has(code.status)),
]

const PromoCodesPage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const loginHref = useLoginHref()
  const { notify } = useToast()
  const userId = user?.id ?? null

  const {
    data,
    isLoading,
    error: fetchError,
    mutate,
  } = useSWR(userId === null ? null : promoCodesKey(userId), listMyPromoCodes)

  const error = fetchError === undefined ? null : messageForError(fetchError, 'promoCodes.load')

  const copy = useCallback(
    (code: string): void => {
      void (async (): Promise<void> => {
        try {
          await navigator.clipboard.writeText(code)
          notify({ tone: 'success', title: 'Код скопирован', subject: code })
        } catch {
          // Без доступа к буферу (http, Telegram Web): код в карточке выделяется целиком по нажатию.
          notify({
            tone: 'warning',
            title: 'Не удалось скопировать',
            description: 'Нажмите на код, чтобы выделить его, и скопируйте вручную',
          })
        }
      })()
    },
    [notify]
  )

  const content = (): React.ReactNode => {
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Промокоды видны после входа"
          description="Войдите - и здесь появятся промокоды, которые вы получили за участие в акциях"
          action={
            <Button link={{ href: loginHref }} isFullWidth="mobile">
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

    if (isAuthLoading || isLoading || data === undefined) {
      return (
        <div className={styles.promoCodeGrid} aria-busy={true}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} shape="block" width="100%" height={240} />
          ))}
        </div>
      )
    }

    if (data.length === 0) {
      return (
        <EmptyState
          title="Промокодов пока нет"
          description="Их выдают за участие в акциях: после оплаты заявки код появится здесь и придёт в Telegram"
          action={
            <Button link={{ href: '/catalog' }} isFullWidth="mobile">
              В каталог
            </Button>
          }
        />
      )
    }

    return (
      <div className={styles.promoCodeGrid}>
        {usableFirst(data).map(code => (
          <PromoCodeCard
            key={code.id}
            code={code}
            onCopy={copy}
            buildOrderHref={orderId => `/orders/${orderId}`}
          />
        ))}
      </div>
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Промокоды - Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <AccountTemplate
        title="Промокоды"
        summary="Код вводится при оформлении заявки, один код - на одну заявку"
        navigation={ACCOUNT_NAVIGATION}
        currentHref="/promocodes"
      >
        {content()}
      </AccountTemplate>
    </SiteLayout>
  )
}

export default PromoCodesPage
