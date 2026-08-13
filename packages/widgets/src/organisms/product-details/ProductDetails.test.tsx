import { describe, expect, it } from 'vitest'
import { ProductDetails, ProductDetailsSkeleton } from '.'
import { feedProductDetails } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('ProductDetails', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<ProductDetails {...feedProductDetails()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('каркас помечен как загружающийся', () => {
    const { container } = renderWidget(<ProductDetailsSkeleton />)

    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true')
  })
})
