import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminOrdersTable } from '.'
import { feedAdminOrder, feedAdminOrdersTable } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminOrdersTable', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminOrdersTable {...feedAdminOrdersTable()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('показывает итоги из `summary`, а не считает их по строкам страницы', () => {
    const { getByText } = renderWidget(<AdminOrdersTable {...feedAdminOrdersTable()} />)

    expect(getByText('Итого: 42 заявки')).toBeTruthy()
    expect(getByText('118 позиций')).toBeTruthy()
  })

  it('без `summary` строки итогов нет', () => {
    const { container } = renderWidget(
      <AdminOrdersTable {...feedAdminOrdersTable()} summary={undefined} />
    )

    expect(container.querySelector('tfoot')).toBeNull()
  })

  it('метит чек на проверке и неоплаченные, а оплату показывает статусом', () => {
    const orders = [
      feedAdminOrder({ status: 'AWAITING_PAYMENT', hasReceipt: true }),
      feedAdminOrder({ status: 'CONFIRMED', paidAt: new Date().toISOString() }),
      feedAdminOrder({ status: 'AWAITING_PAYMENT' }),
    ]
    const { getAllByText, queryByText } = renderWidget(
      <AdminOrdersTable {...feedAdminOrdersTable()} orders={orders} />
    )

    expect(getAllByText('Чек на проверке')).toHaveLength(1)
    expect(getAllByText('Не оплачено')).toHaveLength(1)
    expect(queryByText('Оплачено')).toBeNull()
  })

  it('«Написать через бота» зовёт обработчик, а без привязки к боту недоступна', () => {
    const onMessage = vi.fn()
    const linked = feedAdminOrder({ canMessage: true })
    const unlinked = feedAdminOrder({ canMessage: false })
    const { getAllByRole } = renderWidget(
      <AdminOrdersTable
        {...feedAdminOrdersTable()}
        orders={[linked, unlinked]}
        onMessage={onMessage}
      />
    )

    const [first, second] = getAllByRole('button', {
      name: /Написать покупателю заявки № .* через бота/,
    })
    fireEvent.click(first)
    fireEvent.click(second)

    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith(linked)
    expect(second.getAttribute('aria-disabled')).toBe('true')
  })
})
