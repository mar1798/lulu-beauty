import { describe, expect, it } from 'vitest'
import type { ICategory } from '../types'
import { categoryOptions, categoryTree, topLevelCategories } from './categories'

const category = (id: string, parentId: string | null = null): ICategory => ({
  id,
  name: id,
  slug: `${id}-slug`,
  sortOrder: 0,
  parentId,
})

describe('categoryTree', () => {
  it('ставит подкатегории сразу за их разделом, сохраняя порядок внутри уровня', () => {
    const tree = categoryTree([
      category('face'),
      category('body'),
      category('toners', 'face'),
      category('scrubs', 'body'),
      category('cleansers', 'face'),
    ])

    expect(tree.map(({ category: item, isNested }) => [item.id, isNested])).toEqual([
      ['face', false],
      ['toners', true],
      ['cleansers', true],
      ['body', false],
      ['scrubs', true],
    ])
  })

  /* Раздел удалили в другой вкладке — подкатегория не должна пропасть из фильтра. */
  it('выводит на верхний уровень подкатегорию без раздела в списке', () => {
    const tree = categoryTree([category('face'), category('orphan', 'gone')])

    expect(tree.map(({ category: item, isNested }) => [item.id, isNested])).toEqual([
      ['face', false],
      ['orphan', false],
    ])
  })

  /* Второй уровень бэкенд не допускает, но попавшая туда категория не должна исчезнуть. */
  it('выводит на верхний уровень подкатегорию подкатегории', () => {
    const tree = categoryTree([
      category('face'),
      category('cleansers', 'face'),
      category('foams', 'cleansers'),
    ])

    expect(tree.map(({ category: item, isNested }) => [item.id, isNested])).toEqual([
      ['face', false],
      ['cleansers', true],
      ['foams', false],
    ])
  })
})

describe('categoryOptions', () => {
  it('берёт значение строки через `valueOf` и помечает вложенные', () => {
    expect(
      categoryOptions([category('face'), category('toners', 'face')], item => item.slug)
    ).toEqual([
      { value: 'face-slug', label: 'face', isNested: false },
      { value: 'toners-slug', label: 'toners', isNested: true },
    ])
  })
})

describe('topLevelCategories', () => {
  it('оставляет только разделы', () => {
    expect(
      topLevelCategories([category('face'), category('toners', 'face')]).map(item => item.id)
    ).toEqual(['face'])
  })
})
