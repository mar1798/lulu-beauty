import { type FC } from 'react'
import type { IBasicStyling, ICategoryFilterProps } from '../../types'
import { Select } from '../../atoms/select'

/** Сентинел для «все категории» — у `Select` нет значения `null`. */
const ALL_VALUE = ''

/**
 * Фильтр каталога по категориям.
 *
 * Наружу отдаётся **слаг**, а не id: публичный `GET /products?category=`
 * фильтрует именно по слагу (`app/catalog/service.py`), хотя сам товар
 * приходит с `categoryId`. `null` — «все категории».
 *
 * Выпадающий список, а не ряд чипов: рядом стоит такой же фильтр по бренду,
 * и два соседних фильтра одного назначения должны выглядеть одинаково —
 * иначе они читаются как разные по важности. Раньше чипы показывались от
 * `sm`, а на телефоне подменялись этим же `Select`; теперь список один на
 * все ширины, и раскладка не зависит от того, где компонент стоит.
 *
 * Обёртка над `Select` живёт отдельным компонентом ради того, что нужно
 * обоим экранам: подстановки «все категории» и перевода слага в `null`
 * и обратно.
 */
export const CategoryFilter: FC<ICategoryFilterProps & IBasicStyling> = ({
  categories,
  selectedSlug = null,
  onSelect,
  allLabel = 'Все категории',
  className,
}) => (
  <Select
    className={className}
    label="Категория"
    value={selectedSlug ?? ALL_VALUE}
    onChange={next => onSelect(next === ALL_VALUE ? null : next)}
    options={[
      { value: ALL_VALUE, label: allLabel },
      ...categories.map(category => ({ value: category.slug, label: category.name })),
    ]}
  />
)
