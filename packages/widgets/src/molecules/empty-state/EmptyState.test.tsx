import { describe, expect, it } from 'vitest'
import { EmptyState } from '.'
import { feedEmptyState } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('EmptyState', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<EmptyState {...feedEmptyState()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
