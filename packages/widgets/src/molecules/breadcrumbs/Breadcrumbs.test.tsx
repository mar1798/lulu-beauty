import { describe, expect, it } from 'vitest'
import { Breadcrumbs } from '.'
import { feedBreadcrumbs } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('Breadcrumbs', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<Breadcrumbs {...feedBreadcrumbs()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
