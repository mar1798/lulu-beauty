import { describe, expect, it } from 'vitest'
import { Badge } from '.'
import { feedBadge } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Badge', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Badge {...feedBadge()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
