import React from 'react'
import { DeadlineCountdown } from 'widgets/molecules'
import { useActiveCycle } from '@/hooks/useActiveCycle'
import { useCycleExpiryRefresh } from '@/hooks/useCycleExpiryRefresh'

/**
 * Таймер открытого сбора — для страниц, где сбор не главная тема, но срок
 * знать нужно (шапка каталога).
 *
 * Пока состояние сбора неизвестно, не рисуется ничего: таймер, мигнувший и
 * пропавший, читается как сбой. Когда сбора нет — тоже ничего: про закрытый
 * приём на витрине говорит `ClosedCycleNotice`, и повторять это второй раз,
 * да ещё словами таймера, незачем.
 *
 * На нуле таймер не просто останавливается, а просит перепроверить сбор
 * (`useCycleExpiryRefresh`) — иначе он один на странице знал бы, что приём
 * закрыт, а кнопки и врезка продолжали бы говорить обратное.
 */
export const CycleCountdown: React.FC = () => {
  const { cycle } = useActiveCycle()

  useCycleExpiryRefresh(cycle?.deadlineAt ?? null)

  if (cycle === null) {
    return null
  }

  return <DeadlineCountdown deadlineAt={cycle.deadlineAt} />
}
