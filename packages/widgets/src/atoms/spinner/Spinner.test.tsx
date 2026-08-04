import { describe, expect, it } from 'vitest'
import { Spinner } from '.'
import { feedSpinner } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Spinner', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Spinner {...feedSpinner()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
