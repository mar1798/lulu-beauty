import React, { useCallback, useState } from 'react'
import useSWR from 'swr'
import type { IPromotion } from 'widgets/types'
import { AdminPromotionParticipantsDialog } from 'widgets/organisms'
import { messageForError } from '@/services/apiErrors'
import { listPromotionParticipants } from '@/services/endpoints/promotions'
import { adminPromotionParticipantsKey } from '@/services/swrKeys'

/**
 * Окно «Участники» акции: общее для списка и карточки. Список грузится, когда
 * окно открыто, и каждый раз заново — участники прибавляются без ведома страницы,
 * и список из кеша прошлого открытия показал бы устаревшую картину.
 */
export const usePromotionParticipants = (): {
  open: (promotion: IPromotion) => void
  dialog: React.ReactNode
} => {
  const [promotion, setPromotion] = useState<IPromotion | null>(null)

  const { data, error } = useSWR(
    promotion === null ? null : adminPromotionParticipantsKey(promotion.id),
    () => listPromotionParticipants((promotion as IPromotion).id),
    { revalidateOnFocus: false, dedupingInterval: 0 }
  )

  const open = useCallback((next: IPromotion) => {
    setPromotion(next)
  }, [])

  const dialog = (
    <AdminPromotionParticipantsDialog
      isOpen={promotion !== null}
      onClose={() => {
        setPromotion(null)
      }}
      promotionTitle={promotion?.title ?? ''}
      participants={data ?? null}
      error={error === undefined ? null : messageForError(error, 'admin.promotion.participants')}
      buildOrderHref={() => '/admin/orders'}
    />
  )

  return { open, dialog }
}
