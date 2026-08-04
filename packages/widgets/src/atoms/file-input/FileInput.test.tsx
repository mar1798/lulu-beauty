import { describe, expect, it } from 'vitest'
import { FileInput } from '.'
import { feedFileInput } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('FileInput', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<FileInput {...feedFileInput()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
