import { describe, expect, it } from 'vitest'
import { Button } from '.'
import { feedButton } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Button', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Button {...feedButton()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
