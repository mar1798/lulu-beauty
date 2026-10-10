import { describe, expect, it } from 'vitest'
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

  it('метит оплату: оплаченная важнее присланного чека, без чека метки нет', () => {
    const orders = [
      feedAdminOrder({ status: 'CONFIRMED', hasReceipt: true }),
      feedAdminOrder({ status: 'READY', hasReceipt: true, paidAt: new Date().toISOString() }),
      feedAdminOrder({ status: 'CONFIRMED' }),
    ]
    const { getAllByText } = renderWidget(
      <AdminOrdersTable {...feedAdminOrdersTable()} orders={orders} />
    )

    expect(getAllByText('Чек на проверке')).toHaveLength(1)
    expect(getAllByText('Оплачено')).toHaveLength(1)
  })
})
