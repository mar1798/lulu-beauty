import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IAdminProductValues } from '../../types'
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

    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))

    const volumes = screen.getAllByRole('textbox', { name: 'Объём, мл' })
    const prices = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(volumes[0])
    await userEvent.type(volumes[0], '30')
    await userEvent.clear(prices[0])
    await userEvent.type(prices[0], '1800')
    // У товара без тонов новая строка пустая — копия верхней была бы дублем.
    await userEvent.clear(volumes[1])
    await userEvent.type(volumes[1], '50')
    await userEvent.clear(prices[1])
    await userEvent.type(prices[1], '1000')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: [
          expect.objectContaining({ volumeMl: 30, shade: null, priceCents: 180_000 }),
          { id: null, volumeMl: 50, shade: null, priceCents: 100_000, inStock: true },
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

    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))

    const volumes = screen.getAllByRole('textbox', { name: 'Объём, мл' })
    const prices = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.clear(volumes[0])
    await userEvent.type(volumes[0], '30')
    await userEvent.clear(prices[0])
    await userEvent.type(prices[0], '1000')
    await userEvent.clear(volumes[1])
    await userEvent.type(volumes[1], '30')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Такой объём уже есть выше')).toBeInTheDocument()
  })

  it('последнюю строку убрать не даёт: товар без объёма не сохранить', () => {
    renderWidget(<AdminProductForm {...feedAdminProductForm()} />)

    expect(screen.queryByRole('button', { name: /^Убрать вариант/ })).not.toBeInTheDocument()
  })

  it('отправляет отметку «на главной» вместе с остальными полями', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminProductForm {...feedAdminProductForm()} onSubmit={onSubmit} />)

    const toggle = screen.getByRole('switch', { name: 'Показывать на главной' })
    expect(toggle).not.toBeChecked()

    await userEvent.click(toggle)
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isFeatured: true }))
  })
})

describe('AdminProductForm и тона', () => {
  it('отдаёт тон каждой строки и id загруженного варианта', async () => {
    const onSubmit = vi.fn()
    const feed = feedAdminProductForm()

    renderWidget(<AdminProductForm {...feed} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Тон' }), '01 Nude')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Тон' })[1], '05  Rose ')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    const [{ variants }] = onSubmit.mock.calls[0] as [IAdminProductValues]
    // Пробелы схлопываются — так тон сравнивает и хранит сервер.
    expect(variants.map(variant => variant.shade)).toEqual(['01 Nude', '05 Rose'])
    expect(variants[0].id).toBe(feed.product?.variants[0].id)
    expect(variants[1].id).toBeNull()
  })

  it('не даёт тонам одного объёма разойтись в цене', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminProductForm {...feedAdminProductForm()} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Тон' }), '01')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    const prices = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Тон' })[1], '05')
    await userEvent.clear(prices[1])
    await userEvent.type(prices[1], '9999')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('У тонов одного объёма цена одна - как в строке выше')
    ).toBeInTheDocument()
  })

  it('новую строку у товара с тонами начинает с объёма и цены последней', async () => {
    renderWidget(<AdminProductForm {...feedAdminProductForm()} />)

    const [volume] = screen.getAllByRole('textbox', { name: 'Объём, мл' })
    const [price] = screen.getAllByRole('textbox', { name: 'Цена, сом' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Тон' }), '01')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))

    expect(screen.getAllByRole('textbox', { name: 'Объём, мл' })[1]).toHaveValue(
      (volume as HTMLInputElement).value
    )
    expect(screen.getAllByRole('textbox', { name: 'Цена, сом' })[1]).toHaveValue(
      (price as HTMLInputElement).value
    )
    expect(screen.getAllByRole('textbox', { name: 'Тон' })[1]).toHaveValue('')
  })

  it('новую строку у товара без тонов оставляет пустой', async () => {
    renderWidget(<AdminProductForm {...feedAdminProductForm()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))

    expect(screen.getAllByRole('textbox', { name: 'Объём, мл' })[1]).toHaveValue('')
    expect(screen.getAllByRole('textbox', { name: 'Цена, сом' })[1]).toHaveValue('')
  })

  it('требует тон у всех строк, если он есть хоть у одной', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminProductForm {...feedAdminProductForm()} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Тон' })[0], '01')

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите тон - у других строк он есть')).toBeInTheDocument()
  })

  it('называет тона выбранным словом и отдаёт его с сабмитом', async () => {
    const onSubmit = vi.fn()

    renderWidget(<AdminProductForm {...feedAdminProductForm()} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('combobox', { name: 'Как называть тона' }))
    await userEvent.click(screen.getByRole('option', { name: 'Цвет' }))

    // Колонка и ошибки говорят тем же словом, что увидит покупатель.
    // Сначала цвет, потом строка: у товара с тонами новая строка — копия объёма и цены.
    await userEvent.type(screen.getByRole('textbox', { name: 'Цвет' }), 'Red')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите цвет - у других строк он есть')).toBeInTheDocument()

    await userEvent.type(screen.getAllByRole('textbox', { name: 'Цвет' })[1], 'Pink')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ shadeLabel: 'COLOR' }))
  })
})

describe('AdminProductForm и фото', () => {
  /** Товар в одном объёме и двух тонах. */
  const shadedFeed = () => {
    const feed = feedAdminProductForm()
    const product = feed.product!
    const variant = product.variants[0]
    const variants = [
      { ...variant, shade: '01 Nude' },
      { ...variant, id: `${variant.id}-rose`, shade: '05 Rose' },
    ]

    return { ...feed, product: { ...product, variants } }
  }

  const png = (name = 'photo.png'): File => new File(['x'], name, { type: 'image/png' })

  it('грузит фото, добавленное в группу тона, сразу с привязкой к нему', async () => {
    const onImagesUpload = vi.fn()

    renderWidget(<AdminProductForm {...shadedFeed()} onImagesUpload={onImagesUpload} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить в «05 Rose»' }))
    await userEvent.upload(screen.getByLabelText('Выбрать фото'), png())

    expect(onImagesUpload).toHaveBeenCalledWith([
      expect.objectContaining({ shades: ['05 Rose'], volumesMl: [], hidden: false }),
    ])
  })

  it('сохраняет описание фото вместе с галереей', async () => {
    const onImagesArrange = vi.fn()
    const feed = shadedFeed()

    renderWidget(<AdminProductForm {...feed} onImagesArrange={onImagesArrange} />)

    await userEvent.click(screen.getByRole('button', { name: /^Фото 1\b/ }))
    const dialog = screen.getByRole('dialog')
    const alt = within(dialog).getByRole('textbox', { name: 'Описание (alt)' })
    await userEvent.clear(alt)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    expect(onImagesArrange).toHaveBeenCalledWith([
      expect.objectContaining({ id: feed.images![0].id, alt: null, hidden: false }),
      expect.objectContaining({ id: feed.images![1].id }),
    ])
  })

  it('предупреждает, что новый тон появится в галерее после сохранения', async () => {
    renderWidget(<AdminProductForm {...shadedFeed()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Добавить вариант' }))
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Тон' })[2], '12 Berry')

    expect(
      screen.getByText('Новые тона и объёмы появятся здесь после «Сохранить»')
    ).toBeInTheDocument()
  })

  it('при создании привязывает фото к набранному тону и отдаёт его с сабмитом', async () => {
    const onSubmit = vi.fn()
    const { categories, brands } = feedAdminProductForm()

    renderWidget(<AdminProductForm categories={categories} brands={brands} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Название' }), 'Помада')
    await userEvent.type(screen.getByRole('combobox', { name: 'Производитель' }), 'Romand')
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Тон' })[0], '01 Nude')
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Цена, сом' })[0], '900')

    await userEvent.click(screen.getByRole('button', { name: 'Добавить в «01 Nude»' }))
    await userEvent.upload(screen.getByLabelText('Выбрать фото'), png())
    await userEvent.click(screen.getByRole('button', { name: 'Создать товар' }))

    const values = onSubmit.mock.calls[0][0] as IAdminProductValues
    expect(values.images).toEqual([
      expect.objectContaining({ shades: ['01 Nude'], volumesMl: [], hidden: false, alt: '' }),
    ])
  })

  it('при создании не отдаёт привязку к тону, которого в таблице больше нет', async () => {
    // Тон переименовали после того, как к нему добавили фото: сервер такую
    // привязку не примет (`image_variant_unknown`), и фото уходит «для всех».
    const onSubmit = vi.fn()
    const { categories, brands } = feedAdminProductForm()

    renderWidget(<AdminProductForm categories={categories} brands={brands} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Название' }), 'Помада')
    await userEvent.type(screen.getByRole('combobox', { name: 'Производитель' }), 'Romand')
    const shade = screen.getAllByRole('textbox', { name: 'Тон' })[0]
    await userEvent.type(shade, '01 Nude')
    await userEvent.type(screen.getAllByRole('textbox', { name: 'Цена, сом' })[0], '900')

    await userEvent.click(screen.getByRole('button', { name: 'Добавить в «01 Nude»' }))
    await userEvent.upload(screen.getByLabelText('Выбрать фото'), png())
    await userEvent.type(shade, 'e')
    await userEvent.click(screen.getByRole('button', { name: 'Создать товар' }))

    const values = onSubmit.mock.calls[0][0] as IAdminProductValues
    expect(values.images).toEqual([expect.objectContaining({ shades: [], volumesMl: [] })])
  })
})
