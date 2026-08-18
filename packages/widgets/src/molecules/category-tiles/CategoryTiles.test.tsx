import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { CategoryTiles } from '.'
import { feedCategoryTiles } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

describe('CategoryTiles', () => {
  it('делает каждую плитку ссылкой в каталог и держит порядок списка', () => {
    const feed = feedCategoryTiles()

    renderWidget(<CategoryTiles {...feed} />)

    const links = screen.getAllByRole('link')

    expect(links.map(link => link.textContent)).toEqual(
      feed.categories.map(category => category.name),
    )

    for (const [index, category] of feed.categories.entries()) {
      expect(links[index]).toHaveAttribute('href', feed.buildHref(category))
    }
  })

  /* Плитки — список, а не набор ссылок подряд: скринридер объявляет их число. */
  it('остаётся списком', () => {
    const feed = feedCategoryTiles()

    renderWidget(<CategoryTiles {...feed} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(feed.categories.length)
  })

  it('ничего не рендерит на пустом списке — секцию прячет страница', () => {
    const { container } = renderWidget(
      <CategoryTiles {...feedCategoryTiles()} categories={[]} />,
    )

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.querySelector('li')).toBeNull()
  })
})
