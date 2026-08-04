import { describe, expect, it } from 'vitest'
import { CheckoutForm } from '.'
import { feedCheckoutForm } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CheckoutForm', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CheckoutForm {...feedCheckoutForm()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
