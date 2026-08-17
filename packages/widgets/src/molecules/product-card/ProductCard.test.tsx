import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { ProductCard, primaryImage } from '.'
import { feedProduct, feedProductImageDto } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('primaryImage', () => {
  it('берёт помеченную isPrimary, а не первую по порядку', () => {
    const first = feedProductImageDto(false, 0)
    const marked = feedProductImageDto(true, 1)

    expect(primaryImage([first, marked])).toBe(marked)
  })

  it('без пометки берёт первую', () => {
    const first = feedProductImageDto(false, 0)

    expect(primaryImage([first, feedProductImageDto(false, 1)])).toBe(first)
  })

  it('переживает товар без картинок — так приходят товары после импорта xlsx', () => {
    expect(primaryImage([])).toBeNull()
  })
})

describe('ProductCard', () => {
  it('ведёт на страницу товара и показывает цену', () => {
    const product = feedProduct({ name: 'Сыворотка', priceCents: 125_000, slug: 'serum' })

    renderWidget(<ProductCard product={product} href={`/catalog/${product.slug}`} />)

    expect(screen.getByRole('link', { name: /Сыворотка/ })).toHaveAttribute(
      'href',
      '/catalog/serum'
    )
    expect(screen.getByText(/1\s?250 сом/u)).toBeInTheDocument()
  })

  /*
    Объём — та самая разница между 50 и 500 мл одного и того же средства, и в
    сетке карточек он должен быть виден без захода в карточку.
  */
  it('дописывает объём к меткам под названием — и молчит, когда его нет', () => {
    const product = feedProduct({ brand: 'COSRX', volumeMl: 50 })
    const { rerender } = renderWidget(
      <ProductCard product={product} href="/catalog/x" categoryName="Уход" />
    )

    // Каждая метка — отдельным элементом, а не одной склеенной строкой.
    expect(screen.getByText('COSRX')).toBeInTheDocument()
    expect(screen.getByText('Уход')).toBeInTheDocument()
    expect(screen.getByText('50 мл')).toBeInTheDocument()

    rerender(
      <ProductCard product={{ ...product, volumeMl: null }} href="/catalog/x" categoryName="Уход" />
    )
    expect(screen.queryByText('50 мл')).toBeNull()
  })

  /* Длинная категория из импорта не должна вытеснять соседние метки за край колонки. */
  it('укорачивает слишком длинную метку многоточием', () => {
    renderWidget(
      <ProductCard
        product={feedProduct({ brand: null, volumeMl: null })}
        href="/catalog/x"
        categoryName="Уход за проблемной кожей лица"
      />
    )

    expect(screen.getByText('Уход за проблемно…')).toBeInTheDocument()
  })

  it('помечает товар не в наличии', () => {
    renderWidget(
      <ProductCard product={feedProduct({ inStock: false })} href="/catalog/x" />
    )

    expect(screen.getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('рисует заглушку вместо картинки, когда фотографий нет', () => {
    renderWidget(<ProductCard product={feedProduct({ images: [] })} href="/catalog/x" />)

    expect(screen.queryByRole('img')).toBeNull()
  })
})
