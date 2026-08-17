import { describe, expect, it } from 'vitest'
import { CheckoutPanel } from '.'
import { feedCheckoutPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CheckoutPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} form={<p>Форма</p>} />
    )

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Главное, ради чего компонент и появился: до него на оформлении не было
    видно, что именно уходит владельцу.
  */
  it('показывает позиции корзины с количеством и суммой', () => {
    const props = feedCheckoutPanel()
    const first = props.cart?.items[0]
    const { getByText } = renderWidget(<CheckoutPanel {...props} form={<p>Форма</p>} />)

    expect(first).toBeDefined()
    expect(getByText(first?.productName ?? '')).toBeTruthy()
    expect(getByText(`${first?.quantity ?? 0} шт ×`)).toBeTruthy()
  })

  /*
    Дозаказ показывается только над готовым составом: под скелетонами добавлять
    некуда — непонятно, что уже лежит в корзине.
  */
  it('не показывает дозаказ, пока корзина грузится', () => {
    const { queryByText } = renderWidget(
      <CheckoutPanel
        {...feedCheckoutPanel()}
        cart={null}
        isLoading={true}
        addItem={<p>Подборщик</p>}
        form={<p>Форма</p>}
      />
    )

    expect(queryByText('Подборщик')).toBeNull()
  })

  it('показывает дозаказ под составом', () => {
    const { getByText } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} addItem={<p>Подборщик</p>} form={<p>Форма</p>} />
    )

    expect(getByText('Подборщик')).toBeTruthy()
  })

  it('состав правится в корзине — ссылка ведёт туда', () => {
    const { getByText } = renderWidget(
      <CheckoutPanel {...feedCheckoutPanel()} form={<p>Форма</p>} />
    )

    expect(getByText('Изменить в корзине').getAttribute('href')).toBe('/cart')
  })
})
