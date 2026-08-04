import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICategoryFilterProps } from '../../types'
import { Chip } from '../../atoms/chip'
import * as styles from './CategoryFilter.css'

/**
 * Фильтр каталога по категориям.
 *
 * Наружу отдаётся **слаг**, а не id: публичный `GET /products?category=`
 * фильтрует именно по слагу (`app/catalog/service.py`), хотя сам товар
 * приходит с `categoryId`. `null` — «все категории».
 */
export const CategoryFilter: FC<ICategoryFilterProps & IBasicStyling> = ({
  categories,
  selectedSlug = null,
  onSelect,
  allLabel = 'Все',
  className,
}) => (
  <div className={clsx(styles.container, className)} role="group" aria-label="Категории">
    <Chip
      label={allLabel}
      isSelected={selectedSlug === null}
      onToggle={() => onSelect(null)}
    />

    {categories.map(category => (
      <Chip
        key={category.id}
        label={category.name}
        isSelected={category.slug === selectedSlug}
        // Повторное нажатие по выбранной категории снимает фильтр.
        onToggle={next => onSelect(next ? category.slug : null)}
      />
    ))}
  </div>
)
