import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminOrderEditDialog } from '.'
import { feedAdminOrder, feedAdminOrderEditDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Окно рендерится порталом, поэтому шаблонный smoke-тест не подходит.
 * Проверяем, когда «Сохранить» доступна, и что окно говорит о статусе.
 */
describe('AdminOrderEditDialog', () => {
  it('сохраняет изменённый состав', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(<AdminOrderEditDialog {...feedAdminOrderEditDialog()} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('без изменений сохранять нечего', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderEditDialog
        {...feedAdminOrderEditDialog()}
        hasChanges={false}
        onSubmit={onSubmit}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('пустой состав не сохранить и говорит, что делать вместо', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderEditDialog {...feedAdminOrderEditDialog()} lines={[]} onSubmit={onSubmit} />
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('В заявке не осталось товаров')).toBeTruthy()
  })

  it('у неоплаченного счёта говорит, что нового чека не ждём', () => {
    renderWidget(<AdminOrderEditDialog {...feedAdminOrderEditDialog()} />)

    expect(screen.getByText(/нового чека не ждём/)).toBeTruthy()
  })

  it('у оплаченной заявки говорит, что статус останется', () => {
    renderWidget(
      <AdminOrderEditDialog
        {...feedAdminOrderEditDialog()}
        order={feedAdminOrder({ status: 'CONFIRMED' })}
      />
    )

    expect(screen.getByText(/статус останется прежним/)).toBeTruthy()
  })

  it('показывает прежнюю сумму, пока новая с ней расходится', () => {
    renderWidget(<AdminOrderEditDialog {...feedAdminOrderEditDialog()} />)

    expect(screen.getByText(/Было/)).toBeTruthy()
  })

  it('предупреждает, что без привязки к боту сообщение не придёт', () => {
    renderWidget(
      <AdminOrderEditDialog
        {...feedAdminOrderEditDialog()}
        order={feedAdminOrder({ canMessage: false })}
      />
    )

    expect(screen.getByText(/сообщение об изменении ему не придёт/)).toBeTruthy()
  })
})
