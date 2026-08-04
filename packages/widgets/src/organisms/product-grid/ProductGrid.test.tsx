import { describe, expect, it } from 'vitest'
import { ProductGrid } from '.'
import { feedProductGrid } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('ProductGrid', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ProductGrid {...feedProductGrid()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
