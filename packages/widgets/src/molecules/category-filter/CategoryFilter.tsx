import { type FC } from 'react'
import type { IBasicStyling, ICategoryFilterProps } from '../../types'
import { Select } from '../../atoms/select'
import { categoryOptions } from '../../utils/categories'

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
 *
 * Список идёт деревом: раздел, под ним с отступом его подкатегории. Раздел
 * выбирается так же, как подкатегория, — и показывает весь раздел: товары
 * подкатегорий к нему добавляет бэкенд. Поэтому не `optgroup`: заголовок группы
 * выбрать нельзя.
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
      ...categoryOptions(categories, category => category.slug),
    ]}
  />
)
