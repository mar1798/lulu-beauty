import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { IProductVariant } from '../../types'
import { VariantSelector } from '.'
import { feedProductWithShades, feedVariantSelector } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

const noop = (): void => {}

describe('VariantSelector', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<VariantSelector {...feedVariantSelector()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('объявляет себя радиогруппой, а выбранный объём - отмеченным', () => {
    const props = feedVariantSelector()

    renderWidget(<VariantSelector {...props} />)

    // Одним цветом выбор скринридеру не передать — нужен aria-checked.
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(props.variants.length)
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(options[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('кончившийся объём выбирается наравне с остальными', () => {
    const props = feedVariantSelector()
    const onSelect = vi.fn()

    renderWidget(<VariantSelector {...props} onSelect={onSelect} />)

    // Фикстура: 30 мл в наличии, 50 мл кончились. Цена и наличие показываются
    // над переключателем, и узнать их можно только выбрав объём.
    const soldOut = screen.getAllByRole('radio')[1]
    expect(screen.getByText('50 мл')).toBeInTheDocument()
    expect(soldOut).not.toBeDisabled()

    fireEvent.click(soldOut)
    expect(onSelect).toHaveBeenCalledWith(props.variants[1].id)
  })

  it('не называет на кнопке ни цену, ни наличие', () => {
    const props = feedVariantSelector()

    renderWidget(<VariantSelector {...props} />)

    // Кнопка — это вопрос «какой размер», а не строка прайс-листа.
    for (const option of screen.getAllByRole('radio')) {
      expect(option.textContent).toMatch(/^\d+ мл$/u)
    }
  })

  it('сообщает выбранный объём наверх', () => {
    const props = feedVariantSelector()
    const onSelect = vi.fn()

    renderWidget(<VariantSelector {...props} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('radio')[0])

    expect(onSelect).toHaveBeenCalledWith(props.variants[0].id)
  })

  it('держит группу одной остановкой табуляции', () => {
    const props = feedVariantSelector()

    renderWidget(<VariantSelector {...props} />)

    const options = screen.getAllByRole('radio')
    expect(options[0]).toHaveAttribute('tabindex', '0')
    expect(options[1]).toHaveAttribute('tabindex', '-1')
  })

  /* Трёх объёмов хватает, чтобы увидеть и шаг стрелки, и её ход по кругу. */
  const threeVolumes = (): IProductVariant[] => [
    { id: 'v30', volumeMl: 30, priceCents: 100_000, inStock: true },
    { id: 'v50', volumeMl: 50, priceCents: 160_000, inStock: false },
    { id: 'v100', volumeMl: 100, priceCents: 260_000, inStock: true },
  ]

  it('стрелкой переключается на следующий объём - и уводит за ним фокус', () => {
    const variants = threeVolumes()
    const onSelect = vi.fn()

    renderWidget(<VariantSelector variants={variants} selectedId="v30" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowRight' })

    // Кончившиеся 50 мл не пропускаются: выбрать можно любой объём.
    expect(onSelect).toHaveBeenCalledWith('v50')
    expect(screen.getAllByRole('radio')[1]).toHaveFocus()
  })

  it('стрелкой ходит по кругу', () => {
    const variants = threeVolumes()
    const onSelect = vi.fn()

    renderWidget(<VariantSelector variants={variants} selectedId="v30" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getAllByRole('radio')[0], { key: 'ArrowLeft' })

    expect(onSelect).toHaveBeenCalledWith('v100')
  })

  it('отдаёт остановку табуляции первому объёму, когда не выбрано ничего', () => {
    // Иначе в группу не войти с клавиатуры вовсе: остановки нет ни у кого.
    const variants = threeVolumes()

    renderWidget(<VariantSelector variants={variants} selectedId={null} onSelect={noop} />)

    const options = screen.getAllByRole('radio')
    expect(options[0]).toHaveAttribute('tabindex', '0')
    expect(options[1]).toHaveAttribute('tabindex', '-1')
  })
})

describe('VariantSelector с тонами', () => {
  const shaded = (): IProductVariant[] => feedProductWithShades().variants

  it('рисует два ряда: объёмы и тона выбранного объёма', () => {
    const variants = shaded()

    renderWidget(
      <VariantSelector variants={variants} selectedId={variants[0].id} onSelect={noop} />
    )

    const volumes = screen.getByRole('radiogroup', { name: 'Объём' })
    const shades = screen.getByRole('radiogroup', { name: 'Тон' })
    expect(volumes.querySelectorAll('[role="radio"]')).toHaveLength(2)
    expect(shades.querySelectorAll('[role="radio"]')).toHaveLength(3)
    expect(screen.getByText('Тон: 21 Light')).toBeInTheDocument()
  })

  it('при смене объёма сохраняет тон', () => {
    const variants = shaded()
    const onSelect = vi.fn()
    const beige30 = variants.find(v => v.volumeMl === 30 && v.shade === '23 Beige')
    const beige50 = variants.find(v => v.volumeMl === 50 && v.shade === '23 Beige')

    renderWidget(
      <VariantSelector variants={variants} selectedId={beige30?.id ?? null} onSelect={onSelect} />
    )
    fireEvent.click(screen.getByRole('radio', { name: '50 мл' }))

    expect(onSelect).toHaveBeenCalledWith(beige50?.id)
  })

  it('выбор тона уходит наверх id варианта', () => {
    const variants = shaded()
    const onSelect = vi.fn()
    const sand30 = variants.find(v => v.volumeMl === 30 && v.shade === '25 Sand')

    renderWidget(
      <VariantSelector variants={variants} selectedId={variants[0].id} onSelect={onSelect} />
    )
    fireEvent.click(screen.getByRole('radio', { name: '25 Sand' }))

    expect(onSelect).toHaveBeenCalledWith(sand30?.id)
  })

  it('гасит кончившийся тон, но даёт его выбрать', () => {
    const variants = shaded()
    const sand50 = variants.find(v => v.volumeMl === 50 && v.shade === '25 Sand')

    renderWidget(
      <VariantSelector variants={variants} selectedId={sand50?.id ?? null} onSelect={noop} />
    )

    const option = screen.getByRole('radio', { name: '25 Sand' })
    expect(option).toHaveAttribute('data-unavailable', 'true')
    expect(option).not.toBeDisabled()
  })
})
