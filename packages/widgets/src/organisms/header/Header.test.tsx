import { describe, expect, it } from 'vitest'
import { Header } from '.'
import { feedHeader } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Header', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Header {...feedHeader()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
