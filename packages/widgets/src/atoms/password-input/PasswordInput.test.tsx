import { describe, expect, it } from 'vitest'
import { PasswordInput } from '.'
import { feedPasswordInput } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('PasswordInput', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<PasswordInput {...feedPasswordInput()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
