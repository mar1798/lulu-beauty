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
    Ожидание новой выдачи — не загрузка: товары остаются на экране и остаются
    кликабельными, помечается только занятость сетки.
  */
  it('в ожидании новой выдачи оставляет карточки и помечает сетку занятой', () => {
    const feed = feedProductGrid()

    const { container } = renderWidget(<ProductGrid {...feed} isBusy={true} />)

    expect(container.querySelectorAll('article')).toHaveLength(feed.products.length)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
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

  /*
    Ленивая загрузка на первом экране — то, из-за чего LCP каталога ждал
    полторы секунды до начала загрузки картинки. `priorityCount` снимает её
    ровно с первых карточек и ни с одной больше.

    Фикстура удобна тем, что у последнего товара картинок нет вовсе: он
    рисует заглушку, поэтому `img` в сетке на один меньше, чем карточек.
  */
  it('снимает ленивую загрузку ровно с первых priorityCount карточек', () => {
    const feed = feedProductGrid()

    const { container } = renderWidget(<ProductGrid {...feed} priorityCount={2} />)
    const images = container.querySelectorAll('img')

    expect([...images].map(image => image.getAttribute('loading'))).toEqual([
      'eager',
      'eager',
      'lazy',
    ])
  })

  it('без priorityCount оставляет ленивыми все карточки', () => {
    const feed = feedProductGrid()

    const { container } = renderWidget(<ProductGrid {...feed} />)
    const images = container.querySelectorAll('img')

    expect(images.length).toBeGreaterThan(0)

    for (const image of images) {
      expect(image.getAttribute('loading')).toBe('lazy')
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
