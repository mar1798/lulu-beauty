import { describe, expect, it } from 'vitest'
import { HomeTemplate } from '.'
import { feedHomeTemplate } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('HomeTemplate', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<HomeTemplate {...feedHomeTemplate()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
