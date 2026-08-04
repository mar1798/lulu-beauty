import { describe, expect, it } from 'vitest'
import { Text } from '.'
import { feedText } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Text', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Text {...feedText()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
