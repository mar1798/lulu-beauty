import { describe, expect, it } from 'vitest'
import { OrderStatusBadge, orderStatusLabel } from '.'
import { feedOrderStatusBadge } from '../../stories/feed'
import type { OrderStatus } from '../../types'
import { renderWidget } from '../../testing/render'

/**
 * Компонент — единственный переводчик `OrderStatus` в текст, поэтому проверяем
 * не только рендер, но и что ни одно значение enum не осталось без подписи:
 * пропущенный статус выглядел бы пустой меткой, а не ошибкой.
 */

const ALL_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']

describe('OrderStatusBadge', () => {
  it('рендерится с фикстурой из feed', () => {
    const { getByText } = renderWidget(<OrderStatusBadge {...feedOrderStatusBadge()} />)

    expect(getByText('Подтверждена')).toBeInTheDocument()
  })

  it('даёт непустую русскую подпись каждому статусу', () => {
    for (const status of ALL_STATUSES) {
      expect(orderStatusLabel(status)).not.toBe('')
    }
  })
})
