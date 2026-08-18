import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { HomeCta } from '.'
import { feedHomeCta } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('HomeCta', () => {
  it('набирает заголовок вторым уровнем — h1 занят героем', () => {
    const feed = feedHomeCta()

    renderWidget(<HomeCta {...feed} />)

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(feed.title)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('не рисует необязательные слоты, когда их не передали', () => {
    const feed = feedHomeCta()

    const { container } = renderWidget(
      <HomeCta title={feed.title} actions={feed.actions} />,
    )

    expect(container.textContent).toBe(`${feed.title}${String(feed.actions)}`)
  })

  it('показывает надзаголовок и приписку, когда они есть', () => {
    const feed = feedHomeCta()

    renderWidget(<HomeCta {...feed} eyebrow="Telegram" />)

    expect(screen.getByText('Telegram')).toBeInTheDocument()
    expect(screen.getByText(String(feed.note))).toBeInTheDocument()
  })
})
