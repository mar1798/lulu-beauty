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

  /*
    Заголовок первого экрана — единственный `h1` главной. Надзаголовок при
    этом остаётся обычным текстом: ступени в структуре документа он не даёт.
  */
  it('держит заголовок первым уровнем, а надзаголовок — текстом', () => {
    const feed = feedHomeHero()

    renderWidget(<HomeHero {...feed} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(feed.title)
    expect(screen.queryByRole('heading', { name: feed.eyebrow })).toBeNull()
  })

  it('не рисует врезку сбора, когда её не передали', () => {
    const { container } = renderWidget(<HomeHero title="Заголовок" />)

    expect(container.textContent).toBe('Заголовок')
  })
})
