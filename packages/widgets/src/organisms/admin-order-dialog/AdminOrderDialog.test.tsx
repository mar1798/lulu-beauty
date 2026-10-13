import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminOrderDialog } from '.'
import { feedAdminOrderCycle, feedAdminOrderDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Окно рендерится порталом, поэтому шаблонный smoke-тест не подходит.
 * Проверяем, когда «Создать» доступна, и что окно говорит о сборе.
 */
describe('AdminOrderDialog', () => {
  it('создаёт заявку, когда выбраны покупатель, сбор и товары', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(<AdminOrderDialog {...feedAdminOrderDialog()} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Создать заявку' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('без товаров создать нельзя', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(<AdminOrderDialog {...feedAdminOrderDialog()} lines={[]} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Создать заявку' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('без покупателя создать нельзя', async () => {
    const props = feedAdminOrderDialog()
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderDialog
        {...props}
        customerSelect={{ ...props.customerSelect, value: null }}
        onSubmit={onSubmit}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Создать заявку' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('без подходящего сбора говорит, что класть некуда', () => {
    renderWidget(<AdminOrderDialog {...feedAdminOrderDialog()} cycles={[]} cycleId={null} />)

    expect(screen.getByText('Заявку некуда добавить')).toBeTruthy()
  })

  it('единственный сбор называет текстом, без выбора', () => {
    const cycle = feedAdminOrderCycle({ label: 'Ноябрь' })

    renderWidget(
      <AdminOrderDialog {...feedAdminOrderDialog()} cycles={[cycle]} cycleId={cycle.id} />
    )

    expect(screen.getByText('Ноябрь')).toBeTruthy()
    expect(screen.queryByLabelText('Сбор')).toBeNull()
  })

  it('предупреждает о закрытом сборе и о второй заявке в нём', () => {
    const cycle = feedAdminOrderCycle({
      isOpen: false,
      closedAt: new Date().toISOString(),
      customerOrderIds: ['a1b2c3d4-0000-0000-0000-000000000000'],
    })

    renderWidget(
      <AdminOrderDialog {...feedAdminOrderDialog()} cycles={[cycle]} cycleId={cycle.id} />
    )

    expect(screen.getByText(/покупатель сможет только отменить заявку/)).toBeTruthy()
    expect(screen.getByText('У покупателя уже есть заявка в этом сборе')).toBeTruthy()
    expect(screen.getByText(/№ A1B2C3D4/)).toBeTruthy()
  })

  it('считает итог по черновику', () => {
    renderWidget(<AdminOrderDialog {...feedAdminOrderDialog()} />)

    expect(screen.getByText('Итого · 1 позиция')).toBeTruthy()
  })
})
