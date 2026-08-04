import { describe, expect, it } from 'vitest'
import { Heading } from '.'
import { feedHeading } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Heading', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Heading {...feedHeading()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
