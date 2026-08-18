import { describe, expect, it } from 'vitest'
import { StepScene } from '.'
import { feedStepScene } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('StepScene', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<StepScene {...feedStepScene()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
