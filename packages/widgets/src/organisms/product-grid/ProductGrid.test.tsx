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

  /*
    Лесенка появления (главная) добавляет по обёртке на карточку. В каталоге
    её нет — там сетка меняется от фильтров, и лишний узел ни к чему.
  */
  it('без лесенки кладёт карточки прямо в сетку', () => {
    const feed = feedProductGrid()

    const { container } = renderWidget(<ProductGrid {...feed} />)
    const cells = container.querySelectorAll('article')

    expect(cells).toHaveLength(feed.products.length)

    for (const cell of cells) {
      expect(cell.parentElement?.tagName).toBe('DIV')
      expect(cell.parentElement?.children).toHaveLength(feed.products.length)
    }
  })

  it('с лесенкой оборачивает каждую карточку, не теряя ни одной', () => {
    const feed = feedProductGrid()

    const { container } = renderWidget(<ProductGrid {...feed} isStaggered={true} />)
    const cells = container.querySelectorAll('article')

    expect(cells).toHaveLength(feed.products.length)

    /* Каждая карточка — единственный ребёнок своей обёртки появления. */
    for (const cell of cells) {
      expect(cell.parentElement?.children).toHaveLength(1)
    }
  })
})
