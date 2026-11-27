import React, { useCallback, useState } from 'react'
import useSWR from 'swr'
import type { IAdminPromoCode } from 'widgets/types'
import { AdminPromotionParticipantsDialog } from 'widgets/organisms'
import { messageForError } from '@/services/apiErrors'
import { listPromoCodeParticipants } from '@/services/endpoints/promoCodes'
import { adminPromoCodeParticipantsKey } from '@/services/swrKeys'

const PAGE_SIZE = 20

/**
 * Окно «Использования» промокода: общее для списка и карточки. Тот же диалог, что
 * у акций (`AdminPromotionParticipantsDialog`), - у кода участник это заявка,
 * которая его применила. Каждое открытие грузится заново и начинается с первой
 * страницы, прошлую страницу на время загрузки не держим: тот же хук обслуживает
 * разные коды (см. `usePromotionParticipants`).
 */
export const usePromoCodeParticipants = (): {
  open: (promoCode: IAdminPromoCode) => void
  dialog: React.ReactNode
} => {
  const [promoCode, setPromoCode] = useState<IAdminPromoCode | null>(null)
  const [page, setPage] = useState(1)

  const { data, error } = useSWR(
    promoCode === null ? null : adminPromoCodeParticipantsKey(promoCode.id, page),
    () => listPromoCodeParticipants((promoCode as IAdminPromoCode).id, page, PAGE_SIZE),
    { revalidateOnFocus: false, dedupingInterval: 0 }
  )

  const open = useCallback((next: IAdminPromoCode) => {
    setPage(1)
    setPromoCode(next)
  }, [])

  const dialog = (
    <AdminPromotionParticipantsDialog
      isOpen={promoCode !== null}
      onClose={() => {
        setPromoCode(null)
      }}
      promotionTitle={promoCode === null ? '' : `${promoCode.code} - ${promoCode.title}`}
      participants={data?.items ?? null}
      page={page}
      pageSize={PAGE_SIZE}
      total={data?.total ?? 0}
      onPageChange={setPage}
      error={error === undefined ? null : messageForError(error, 'admin.promoCode.participants')}
      buildOrderHref={() => '/admin/orders'}
    />
  )

  return { open, dialog }
}
