import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminChecklistExtraDialog } from '.'
import { feedAdminChecklistExtraDialog } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/** Окно рендерится порталом, поэтому шаблонный smoke-тест не подходит. */
describe('AdminChecklistExtraDialog', () => {
  it('добавляет пункт с ценой 0 по умолчанию', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminChecklistExtraDialog {...feedAdminChecklistExtraDialog()} onSubmit={onSubmit} />
    )

    await user.type(screen.getByRole('textbox', { name: /Наименование/ }), '  Пакеты ')
    const quantity = screen.getByRole('textbox', { name: /Количество/ })
    await user.clear(quantity)
    await user.type(quantity, '20')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Пакеты', quantity: 20, unitPriceCents: 0 })
  })

  it('переводит цену в копейки', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminChecklistExtraDialog {...feedAdminChecklistExtraDialog()} onSubmit={onSubmit} />
    )

    await user.type(screen.getByRole('textbox', { name: /Наименование/ }), 'Тестер')
    const price = screen.getByRole('textbox', { name: /Цена/ })
    await user.clear(price)
    await user.type(price, '1250,5')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Тестер', quantity: 1, unitPriceCents: 125_050 })
  })

  it('без названия не добавляет и говорит почему', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderWidget(
      <AdminChecklistExtraDialog {...feedAdminChecklistExtraDialog()} onSubmit={onSubmit} />
    )

    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите, что купить')).toBeTruthy()
  })
})
