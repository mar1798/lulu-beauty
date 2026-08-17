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

  it('называет предел, когда объём больше допустимого', async () => {
    // Раньше «50000» разбиралось как «набрано не число» и получало текст
    // «целым числом: например, 50» — про опечатку, которой не было.
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    const volume = screen.getByRole('textbox', { name: 'Объём, мл' })
    await userEvent.clear(volume)
    await userEvent.type(volume, '50000')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Объём не больше 10 000 мл.')
  })

  it('не даёт набрать в объём больше пяти знаков', async () => {
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} />)

    const volume = screen.getByRole('textbox', { name: 'Объём, мл' })
    await userEvent.clear(volume)
    await userEvent.type(volume, '1234567')

    expect(volume).toHaveValue('12345')
  })

  it('не сохраняет цену выше потолка колонки', async () => {
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    const price = screen.getByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(price)
    await userEvent.type(price, '30000000')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Цена не больше 20 000 000 сом.')
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
