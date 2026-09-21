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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ brand: 'Beauty of Joseon' }))
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
    expect(screen.getByRole('alert')).toHaveTextContent('Объём не больше 10 000 мл')
  })

  it('не даёт набрать в объём больше пяти знаков', async () => {
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} />)

    const volume = screen.getByRole('textbox', { name: 'Объём, мл' })
    await userEvent.clear(volume)
    await userEvent.type(volume, '1234567')

    expect(volume).toHaveValue('12345')
  })

  it('не пускает буквы ни в объём, ни в цену', async () => {
    // Поля числовые: отсеиваем на вводе, а не ругаемся на сабмите.
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} />)

    const volume = screen.getByRole('textbox', { name: 'Объём, мл' })
    await userEvent.clear(volume)
    await userEvent.type(volume, '5e0ф мл')
    expect(volume).toHaveValue('50')

    const price = screen.getByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(price)
    await userEvent.type(price, '1a250,5сом')
    expect(price).toHaveValue('1250,5')
  })

  it('держит в цене один разделитель и две копейки', async () => {
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} />)

    const price = screen.getByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(price)
    await userEvent.type(price, '12.34.56')

    expect(price).toHaveValue('12.34')
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
    expect(screen.getByRole('alert')).toHaveTextContent('Цена не больше 20 000 000 сом')
  })

  it('не сохраняет товар без производителя', async () => {
    // Бренд обязателен: без него товар не находится фильтром каталога.
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    await userEvent.clear(screen.getByRole('combobox', { name: 'Производитель' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите производителя')
  })
})

describe('AdminProductForm и несколько объёмов', () => {
  it('отдаёт объёмы списком, а витринные поля считает по нему', async () => {
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить объём' }))

    const volumes = screen.getAllByRole('textbox', { name: 'Объём, мл' })
    const prices = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(volumes[0])
    await userEvent.type(volumes[0], '30')
    await userEvent.clear(prices[0])
    await userEvent.type(prices[0], '1800')
    await userEvent.type(volumes[1], '50')
    await userEvent.type(prices[1], '1000')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: [
          { volumeMl: 30, priceCents: 180_000, inStock: true },
          { volumeMl: 50, priceCents: 100_000, inStock: true },
        ],
        // Те же три правила, что и у бэкенда: минимум, объём только пока он
        // один, наличие — «хоть один есть».
        priceCents: 100_000,
        volumeMl: null,
        inStock: true,
      })
    )
  })

  it('не даёт указать один объём дважды и говорит, какая строка лишняя', async () => {
    // Иначе это 500 из частичного уникального индекса на бэкенде, а не ошибка
    // формы, и владелец не узнает, какую строку править.
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить объём' }))

    const volumes = screen.getAllByRole('textbox', { name: 'Объём, мл' })
    const prices = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(volumes[0])
    await userEvent.type(volumes[0], '30')
    await userEvent.clear(prices[0])
    await userEvent.type(prices[0], '1000')
    await userEvent.type(volumes[1], '30')
    await userEvent.type(prices[1], '1200')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Такой объём уже есть выше')).toBeInTheDocument()
  })

  it('последнюю строку убрать не даёт: товар без объёма не сохранить', () => {
    renderWidget(<AdminProductForm {...feedAdminProductForm()} />)

    expect(screen.queryByRole('button', { name: /^Убрать объём/ })).not.toBeInTheDocument()
  })
})
