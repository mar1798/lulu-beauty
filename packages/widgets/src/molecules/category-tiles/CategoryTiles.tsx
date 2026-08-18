import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ICategoryTilesProps } from '../../types'
import { IconChevronRight } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { Reveal } from '../../atoms/reveal'
import { staggerDelay } from '../../utils/motion'
import * as styles from './CategoryTiles.css'

/**
 * Сетка категорий — оглавление ассортимента и вход в каталог с фильтром.
 * С ревизии 2 — компактные чипы, а не плитки: оглавление не должно спорить
 * с подборкой товаров за пол-экрана.
 *
 * Без изображений: у `ICategory` их нет, а подставлять чужие фотографии
 * значит врать. Чип держат название текстовым кеглем и шеврон. Список
 * приходит уже отсортированным по `sortOrder` — так его отдаёт
 * `GET /categories`.
 *
 * Лесенка появления по индексу: на многоколоночной сетке она читается как
 * диагональ — по направлению чтения, сверху вниз и слева направо.
 */
export const CategoryTiles: FC<ICategoryTilesProps & IBasicStyling> = ({
  categories,
  buildHref,
  className,
}) => (
  <ul className={clsx(styles.container, className)}>
    {categories.map((category, index) => (
      <Reveal key={category.id} as="li" delay={staggerDelay(index)}>
        <AppLink href={buildHref(category)} className={styles.tile}>
          <span className={styles.name}>{category.name}</span>

          <IconChevronRight className={styles.chevron} />
        </AppLink>
      </Reveal>
    ))}
  </ul>
)
