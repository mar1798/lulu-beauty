import type { ICategory, ISelectOption } from '../types'

/** Категория и её место в дереве: раздел или подкатегория под ним. */
export interface ICategoryTreeEntry {
  category: ICategory
  isNested: boolean
}

/**
 * Категории в порядке дерева: раздел, сразу за ним его подкатегории, затем
 * следующий раздел.
 *
 * Внутри уровня порядок тот, в котором список пришёл (`sortOrder` с бэкенда), —
 * здесь он не пересчитывается. Подкатегория, чей раздел в списке не нашёлся,
 * встаёт на верхний уровень: потерять её из фильтра хуже, чем показать без отступа.
 * Так же встаёт и категория второго уровня (подкатегория подкатегории): бэкенд её
 * не допускает, но если она всё же окажется в базе, раскрыть её некому — а без
 * строки в списке её не исправить и из админки.
 */
export const categoryTree = (categories: ICategory[]): ICategoryTreeEntry[] => {
  const byId = new Map(categories.map(category => [category.id, category]))
  const isTopLevel = (category: ICategory): boolean => {
    const parent = category.parentId === null ? undefined : byId.get(category.parentId)

    return parent === undefined || parent.parentId !== null
  }

  return categories
    .filter(isTopLevel)
    .flatMap(section => [
      { category: section, isNested: false },
      ...categories
        .filter(category => category.parentId === section.id)
        .map(category => ({ category, isNested: true })),
    ])
}

/**
 * Строки выпадающего списка категорий — деревом, с отступом у подкатегорий.
 *
 * `valueOf` — потому что фильтры каталога адресуют категорию слагом
 * (`GET /products?category=`), а форма товара — id.
 */
export const categoryOptions = (
  categories: ICategory[],
  valueOf: (category: ICategory) => string
): ISelectOption[] =>
  categoryTree(categories).map(({ category, isNested }) => ({
    value: valueOf(category),
    label: category.name,
    isNested,
  }))

/** Разделы — категории верхнего уровня. */
export const topLevelCategories = (categories: ICategory[]): ICategory[] =>
  categories.filter(category => category.parentId === null)
