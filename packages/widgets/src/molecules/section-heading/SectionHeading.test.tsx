import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { SectionHeading } from '.'
import { feedSectionHeading } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('SectionHeading', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<SectionHeading {...feedSectionHeading()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  it('titleDecor стоит внутри заголовка, после его текста', () => {
    const feed = feedSectionHeading()

    renderWidget(<SectionHeading {...feed} titleDecor={<i data-testid="decor" />} />)

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toContainElement(screen.getByTestId('decor'))
    expect(heading.lastElementChild).toContainElement(screen.getByTestId('decor'))
    expect(heading.firstChild?.textContent).toBe(feed.title)
  })

  it('без titleDecor в заголовке только текст', () => {
    renderWidget(<SectionHeading {...feedSectionHeading()} />)

    expect(screen.getByRole('heading', { level: 2 }).children).toHaveLength(0)
  })
})
