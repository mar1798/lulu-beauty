import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminProductForm } from '.'
import { feedAdminProductForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AdminProductForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AdminProductForm {...feedAdminProductForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('сохраняет производителя под уже принятым в каталоге написанием', async () => {
    // Иначе «round lab» стал бы вторым брендом рядом с «Round Lab», и фильтр
    // каталога показывал бы половину его товаров.
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    const brand = screen.getByRole('combobox', { name: 'Производитель' })
    await userEvent.clear(brand)
    await userEvent.type(brand, 'ROUND lab')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ brand: 'Round Lab' }))
  })

  it('пропускает нового производителя как набран', async () => {
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    const brand = screen.getByRole('combobox', { name: 'Производитель' })
    await userEvent.clear(brand)
    await userEvent.type(brand, 'Beauty of Joseon')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'Beauty of Joseon' })
    )
  })

  it('не сохраняет товар без производителя', async () => {
    // Бренд обязателен: без него товар не находится фильтром каталога.
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    await userEvent.clear(screen.getByRole('combobox', { name: 'Производитель' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите производителя.')
  })
})
