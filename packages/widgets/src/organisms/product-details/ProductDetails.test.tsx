import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ProductDetails, ProductDetailsSkeleton } from '.'
import { formatPrice } from '../../atoms/price'
import { feedProductDetails, feedProductWithVariants } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('ProductDetails', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ProductDetails {...feedProductDetails()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('каркас помечен как загружающийся', () => {
    const { container } = renderWidget(<ProductDetailsSkeleton />)

    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
  })
})

/**
 * Цена набирается неразрывными пробелами (`Intl`), а в подписи объёма стоит та
 * же строка — сравнение по регулярке с любым пробелом надёжнее точного текста.
 */
const priceText = (priceCents: number): RegExp =>
  new RegExp(formatPrice(priceCents).replace(/\s/gu, '\\s').replace(/,/gu, ','))

describe('ProductDetails и несколько объёмов', () => {
  it('цену и наличие берёт с выбранного объёма, а не с товара', () => {
    const product = feedProductWithVariants({
      // Круглые числа: цена из фикстуры случайная и с копейками, а тест про
      // то, какая из двух показана, а не про форматирование.
      variants: [
        { id: 'small', volumeMl: 30, priceCents: 100_000, inStock: true },
        { id: 'large', volumeMl: 50, priceCents: 180_000, inStock: false },
      ],
    })
    const [small, large] = product.variants

    const { rerender } = renderWidget(
      <ProductDetails product={product} selectedVariantId={small.id} onSelectVariant={vi.fn()} />
    )

    // Несколько совпадений: та же цена подписана и на кнопке объёма.
    expect(screen.getAllByText(priceText(small.priceCents)).length).toBeGreaterThan(0)
    expect(screen.getByText('В наличии')).toBeInTheDocument()

    // В фикстуре большой объём кончился — переключение должно это показать,
    // хотя сам товар по-прежнему «в наличии».
    rerender(
      <ProductDetails product={product} selectedVariantId={large.id} onSelectVariant={vi.fn()} />
    )

    expect(screen.getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('сообщает выбранный объём наверх', () => {
    const product = feedProductWithVariants()
    const onSelectVariant = vi.fn()

    renderWidget(
      <ProductDetails
        product={product}
        selectedVariantId={product.variants[0].id}
        onSelectVariant={onSelectVariant}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: /30 мл/ }))

    expect(onSelectVariant).toHaveBeenCalledWith(product.variants[0].id)
  })

  it('у товара с одним объёмом переключателя нет - выбирать нечего', () => {
    renderWidget(<ProductDetails {...feedProductDetails()} onSelectVariant={vi.fn()} />)

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('оба действия стоят в строке - второе не подменяет первое', () => {
    renderWidget(
      <ProductDetails
        {...feedProductDetails()}
        action={<button type="button">В корзину</button>}
        secondaryAction={<button type="button">Добавить в избранное</button>}
      />
    )

    expect(screen.getByRole('button', { name: 'В корзину' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить в избранное' })).toBeInTheDocument()
  })

  it('показывает объяснение под кнопками, не вместо них', () => {
    // Погашенная «в корзину» говорит, что нельзя, и ничего — почему.
    renderWidget(
      <ProductDetails
        {...feedProductDetails()}
        action={<button type="button">В корзину</button>}
        note="Сейчас товара нет в сборе"
      />
    )

    expect(screen.getByRole('button', { name: 'В корзину' })).toBeInTheDocument()
    expect(screen.getByText('Сейчас товара нет в сборе')).toBeInTheDocument()
  })
})
