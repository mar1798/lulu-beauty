import { describe, expect, it } from 'vitest'
import { AuthTemplate } from '.'
import { feedAuthTemplate } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('AuthTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<AuthTemplate {...feedAuthTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
