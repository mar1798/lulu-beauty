import { describe, expect, it } from 'vitest'
import { __name__ } from '.'
import { feed__name__ } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('__name__', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<__name__ {...feed__name__()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
