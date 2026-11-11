import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminOrderDiscountDialog } from '.'
import { formatPrice } from '../../atoms/price'
import { feedAdminOrderDiscountDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Окно рендерится порталом, поэтому шаблонный smoke-тест не подходит.
 * Проверяем, что уходит в `onSubmit`, предпросмотр суммы и отказ без размера.
 */
describe('AdminOrderDiscountDialog', () => {
  it('скидка процентом на всю заявку с причиной', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderDiscountDialog {...feedAdminOrderDiscountDialog()} onSubmit={onSubmit} />
    )
    await user.type(screen.getByLabelText(/Размер, %/), '10')
    await user.type(screen.getByLabelText(/Причина/), '  Постоянный клиент ')
    await user.click(screen.getByRole('button', { name: 'Дать скидку' }))

    expect(onSubmit).toHaveBeenCalledWith({
      itemId: null,
      kind: 'PERCENT',
      value: 10,
      note: 'Постоянный клиент',
    })
  })

  it('отдаёт набранное на расчёт и показывает сумму, которую вернула страница', async () => {
    const onDraftChange = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderDiscountDialog {...feedAdminOrderDiscountDialog()} onDraftChange={onDraftChange} />
    )
    await user.type(screen.getByLabelText(/Размер, %/), '10')

    expect(onDraftChange).toHaveBeenLastCalledWith({ itemId: null, kind: 'PERCENT', value: 10 })
    // Сумму считает бэкенд — в окне то, что пришло в `preview`.
    expect(screen.getByText(/Было/)).toBeTruthy()
    // Разряды Intl разделяет неразрывным пробелом, который нормализатор
    // testing-library сворачивает, — сравниваем текст как есть.
    expect(
      screen.getAllByText((_, element) => element?.textContent === formatPrice(378_000))
    ).not.toHaveLength(0)
  })

  it('у выбранной строки показывает цену за штуку и сумму строки', async () => {
    const user = userEvent.setup()

    renderWidget(<AdminOrderDiscountDialog {...feedAdminOrderDiscountDialog()} />)
    await user.click(screen.getByRole('combobox', { name: 'Скидка на' }))
    await user.click(screen.getByRole('option', { name: /Тонер Heartleaf/ }))

    expect(screen.getByText('× 2 шт')).toBeTruthy()
    expect(
      screen.getAllByText((_, element) => element?.textContent === formatPrice(150_000))
    ).not.toHaveLength(0)
    expect(
      screen.getAllByText((_, element) => element?.textContent === formatPrice(300_000))
    ).not.toHaveLength(0)
  })

  it('отказ бэкенда виден у поля и не даёт отправить', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const preview = {
      totalCents: null,
      error: 'Скидка больше суммы, с которой она снимается',
      isPending: false,
    }

    renderWidget(
      <AdminOrderDiscountDialog
        {...feedAdminOrderDiscountDialog()}
        preview={preview}
        onSubmit={onSubmit}
      />
    )
    await user.type(screen.getByLabelText(/Размер, %/), '90')
    await user.click(screen.getByRole('button', { name: 'Дать скидку' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Скидка больше суммы, с которой она снимается')).toBeTruthy()
  })

  it('без размера не отправляет', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminOrderDiscountDialog {...feedAdminOrderDiscountDialog()} onSubmit={onSubmit} />
    )
    await user.click(screen.getByRole('button', { name: 'Дать скидку' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Процент от 1 до 100')).toBeTruthy()
  })

  it('стоящую скидку можно снять', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    const props = feedAdminOrderDiscountDialog()
    const order =
      props.order === null
        ? null
        : {
            ...props.order,
            discountKind: 'AMOUNT' as const,
            discountValue: 50_000,
            discountNote: 'Акция',
            discountCents: 50_000,
          }

    renderWidget(<AdminOrderDiscountDialog {...props} order={order} onRemove={onRemove} />)

    expect(screen.getByText(`Сейчас: скидка ${formatPrice(50_000)} - Акция`)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Снять скидку' }))

    expect(onRemove).toHaveBeenCalledWith(null)
  })

  it('пока чек на проверке, скидку не дать', () => {
    const props = feedAdminOrderDiscountDialog()
    const order = props.order === null ? null : { ...props.order, hasReceipt: true }

    renderWidget(<AdminOrderDiscountDialog {...props} order={order} />)

    expect(screen.getByText('Чек на проверке')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Дать скидку' })).toBeDisabled()
  })

  it('та же скидка с той же причиной — не изменение', () => {
    const props = feedAdminOrderDiscountDialog()
    const order =
      props.order === null
        ? null
        : {
            ...props.order,
            discountKind: 'PERCENT' as const,
            discountValue: 10,
            discountNote: null,
            discountCents: 42_000,
          }

    renderWidget(<AdminOrderDiscountDialog {...props} order={order} />)

    expect(screen.getByRole('button', { name: 'Изменить скидку' })).toBeDisabled()
    expect(screen.getByText('Скидка уже такая - измените размер или причину')).toBeTruthy()
  })
})
