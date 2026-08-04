import { describe, expect, it } from 'vitest'
import { CartPanel } from '.'
import { feedCartPanel } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('CartPanel', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<CartPanel {...feedCartPanel()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
