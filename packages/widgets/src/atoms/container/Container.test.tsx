import { describe, expect, it } from 'vitest'
import { Container } from '.'
import { feedContainer } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Container', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Container {...feedContainer()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
