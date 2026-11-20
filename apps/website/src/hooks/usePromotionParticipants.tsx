import React, { useCallback, useState } from 'react'
import useSWR from 'swr'
import type { IPromotion } from 'widgets/types'
import { AdminPromotionParticipantsDialog } from 'widgets/organisms'
import { messageForError } from '@/services/apiErrors'
import { listPromotionParticipants } from '@/services/endpoints/promotions'
import { adminPromotionParticipantsKey } from '@/services/swrKeys'

const PAGE_SIZE = 20

/**
 * Окно «Участники» акции: общее для списка и карточки. Список грузится, когда
 * окно открыто, и каждый раз заново — участники прибавляются без ведома страницы,
 * и список из кеша прошлого открытия показал бы устаревшую картину.
 *
 * Постранично: участников у акции не ограничено. Каждое открытие начинает с
 * первой страницы. Прошлую страницу на время загрузки следующей не держим
 * (`keepPreviousData`): тот же хук обслуживает разные акции, и окно новой акции
 * на миг показало бы участников предыдущей.
 */
export const usePromotionParticipants = (): {
  open: (promotion: IPromotion) => void
  dialog: React.ReactNode
} => {
  const [promotion, setPromotion] = useState<IPromotion | null>(null)
  const [page, setPage] = useState(1)

  const { data, error } = useSWR(
    promotion === null ? null : adminPromotionParticipantsKey(promotion.id, page),
    () => listPromotionParticipants((promotion as IPromotion).id, page, PAGE_SIZE),
    { revalidateOnFocus: false, dedupingInterval: 0 }
  )

  const open = useCallback((next: IPromotion) => {
    setPage(1)
    setPromotion(next)
  }, [])

  const dialog = (
    <AdminPromotionParticipantsDialog
      isOpen={promotion !== null}
      onClose={() => {
        setPromotion(null)
      }}
      promotionTitle={promotion?.title ?? ''}
      participants={data?.items ?? null}
      page={page}
      pageSize={PAGE_SIZE}
      total={data?.total ?? 0}
      onPageChange={setPage}
      error={error === undefined ? null : messageForError(error, 'admin.promotion.participants')}
      buildOrderHref={() => '/admin/orders'}
    />
  )

  return { open, dialog }
}
