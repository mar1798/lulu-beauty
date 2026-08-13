import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICategoryFilterProps } from '../../types'
import { Chip } from '../../atoms/chip'
import { Select } from '../../atoms/select'
import * as styles from './CategoryFilter.css'

/** Сентинел для «все категории» — нативный `<select>` не умеет в значение `null`. */
const ALL_VALUE = ''

/**
 * Фильтр каталога по категориям.
 *
 * Наружу отдаётся **слаг**, а не id: публичный `GET /products?category=`
 * фильтрует именно по слагу (`app/catalog/service.py`), хотя сам товар
 * приходит с `categoryId`. `null` — «все категории».
 *
 * На мобильном строка чипов при большом числе категорий превращается в
 * хаос, поэтому там вместо неё — выпадающий список; от `sm` возвращается
 * ряд чипов. Оба варианта рендерятся всегда, переключает их только
 * медиа-запрос, чтобы гидратация не зависела от ширины экрана на сервере.
 *
 * `layout="column"` выстраивает чипы столбцом во всю ширину — так фильтр
 * живёт в узкой боковой колонке админки, где строка с переносом рвалась бы
 * по длинным названиям.
 */
export const CategoryFilter: FC<ICategoryFilterProps & IBasicStyling> = ({
  categories,
  selectedSlug = null,
  onSelect,
  allLabel = 'Все',
  layout = 'row',
  className,
}) => (
  <div className={className}>
    <Select
      className={styles.mobileOnly}
      label="Категория"
      value={selectedSlug ?? ALL_VALUE}
      onChange={next => onSelect(next === ALL_VALUE ? null : next)}
      options={[
        { value: ALL_VALUE, label: allLabel },
        ...categories.map(category => ({ value: category.slug, label: category.name })),
      ]}
    />

    <div
      className={clsx(styles.container, styles.desktopOnly, layout === 'column' && styles.column)}
      role="group"
      aria-label="Категории"
    >
      <Chip
        label={allLabel}
        isSelected={selectedSlug === null}
        isBlock={layout === 'column'}
        onToggle={() => onSelect(null)}
      />

      {categories.map(category => (
        <Chip
          key={category.id}
          label={category.name}
          isSelected={category.slug === selectedSlug}
          isBlock={layout === 'column'}
          // Повторное нажатие по выбранной категории снимает фильтр.
          onToggle={next => onSelect(next ? category.slug : null)}
        />
      ))}
    </div>
  </div>
)
