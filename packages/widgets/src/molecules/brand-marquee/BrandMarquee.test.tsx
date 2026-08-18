import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { BrandMarquee, SECONDS_PER_BRAND } from '.'
import { feedBrandMarquee } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Лента дублируется ради бесшовного цикла, и именно дубль — источник обеих
 * возможных ошибок: список, прочитанный скринридером дважды, и Tab, который
 * обходит невидимые копии ссылок. Тест сторожит и то, и другое.
 */
describe('BrandMarquee', () => {
  it('даёт по одной ссылке на бренд, несмотря на дубль дорожки', () => {
    const feed = feedBrandMarquee()

    renderWidget(<BrandMarquee {...feed} />)

    for (const brand of feed.brands) {
      const links = screen.getAllByRole('link', { name: brand })

      expect(links).toHaveLength(1)
      expect(links[0]).toHaveAttribute('href', feed.buildHref(brand))
    }
  })

  it('прячет дубль от скринридера', () => {
    const feed = feedBrandMarquee()

    const { container } = renderWidget(<BrandMarquee {...feed} />)
    const rows = container.querySelectorAll('ul')

    expect(rows).toHaveLength(2)
    expect(rows[0]).not.toHaveAttribute('aria-hidden')
    expect(rows[1]).toHaveAttribute('aria-hidden', 'true')
  })

  /*
    Оборот считается от числа брендов: длинная лента должна ехать с той же
    линейной скоростью, что короткая, а не «за то же время».
  */
  it('считает оборот от числа брендов и уступает явному значению', () => {
    const feed = feedBrandMarquee()

    const { container } = renderWidget(<BrandMarquee {...feed} />)
    const track = container.querySelector('ul')?.parentElement

    expect(track?.style.animationDuration).toBe(
      `${feed.brands.length * SECONDS_PER_BRAND}s`,
    )

    const explicit = renderWidget(<BrandMarquee {...feed} durationSeconds={12} />)

    expect(
      explicit.container.querySelector('ul')?.parentElement?.style.animationDuration,
    ).toBe('12s')
  })
})
