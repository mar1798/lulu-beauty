import { describe, expect, it } from 'vitest'
import { Header } from '.'
import { feedHeader } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Header', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Header {...feedHeader()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('кладёт decor последним ребёнком шапки, а cartDecor - первым в ссылку корзины', () => {
    const { container } = renderWidget(
      <Header
        {...feedHeader()}
        decor={<div data-testid="decor" />}
        cartDecor={<i data-testid="cart-decor" />}
      />
    )

    const header = container.querySelector('header')
    expect(header?.lastElementChild?.getAttribute('data-testid')).toBe('decor')
    const cart = container.querySelector('a[aria-label^="Корзина"]')
    expect(cart?.firstElementChild?.getAttribute('data-testid')).toBe('cart-decor')
  })
})
