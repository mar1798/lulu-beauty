import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { HomeHero } from '.'
import { feedHomeHero } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('HomeHero', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<HomeHero {...feedHomeHero()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /* Заголовок первого экрана — единственный `h1` главной. */
  it('держит заголовок первым уровнем', () => {
    const feed = feedHomeHero()
    // Заголовок приходит готовой разбивкой на строки — маска выхода построчная.
    const lines = Array.isArray(feed.title) ? feed.title : [feed.title]

    renderWidget(<HomeHero {...feed} />)

    const heading = screen.getByRole('heading', { level: 1 })

    for (const line of lines) {
      expect(heading).toHaveTextContent(line)
    }

    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('не рисует врезку сбора, когда её не передали', () => {
    const { container } = renderWidget(<HomeHero title="Заголовок" />)

    expect(container.textContent).toBe('Заголовок')
  })
})
