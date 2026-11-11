import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminOrderEditDialog } from '.'
import { formatPrice } from '../../atoms/price'
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

  it('считает итог со скидками и показывает скидку строки', () => {
    const props = feedAdminOrderEditDialog()
    const kept = props.lines.filter(line => line.itemId !== null)
    const first = kept[0]
    const order =
      props.order === null || first === undefined
        ? null
        : {
            ...props.order,
            items: props.order.items.map(item =>
              item.id === first.itemId
                ? {
                    ...item,
                    discountKind: 'AMOUNT' as const,
                    discountValue: 100,
                    discountNote: 'Брак',
                    discountCents: 100,
                  }
                : item
            ),
          }

    renderWidget(<AdminOrderEditDialog {...props} order={order} lines={kept} />)

    const full = kept.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)

    expect(screen.getByText(`Скидка ${formatPrice(100)} - Брак`)).toBeTruthy()
    expect(
      screen.getAllByText((_, element) => element?.textContent === formatPrice(full - 100))
    ).not.toHaveLength(0)
  })

  it('предупреждает, что правка снимет скидку на заявку, и считает итог без неё', () => {
    const props = feedAdminOrderEditDialog()
    const order =
      props.order === null
        ? null
        : {
            ...props.order,
            discountKind: 'PERCENT' as const,
            discountValue: 10,
            discountNote: null,
            discountCents: 1_000,
          }

    renderWidget(<AdminOrderEditDialog {...props} order={order} />)

    const full = props.lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)

    expect(screen.getByText('Скидка снимется')).toBeTruthy()
    expect(
      screen.getByText(/скидка 10% на всю заявку - она была дана на прежний состав/)
    ).toBeTruthy()
    expect(
      screen.getAllByText((_, element) => element?.textContent === formatPrice(full))
    ).not.toHaveLength(0)
  })
})
