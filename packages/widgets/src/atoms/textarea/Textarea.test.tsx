import { describe, expect, it } from 'vitest'
import { Textarea } from '.'
import { feedTextarea } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Textarea', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Textarea {...feedTextarea()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
