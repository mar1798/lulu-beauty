import { describe, expect, it } from 'vitest'
import { OrderDetails } from '.'
import { feedOrderDetails } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('OrderDetails', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<OrderDetails {...feedOrderDetails()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
