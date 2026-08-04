import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IBreadcrumbsProps } from '../../types'
import { AppLink } from '../../atoms/app-link'
import * as styles from './Breadcrumbs.css'

/**
 * Хлебные крошки. Список — настоящий `<ol>`: скринридер объявляет число
 * уровней, а разделитель рисуется псевдоэлементом и в озвучку не попадает.
 */
export const Breadcrumbs: FC<IBreadcrumbsProps & IBasicStyling> = ({
  items,
  current,
  className,
}) => (
  <nav className={className} aria-label="Хлебные крошки">
    <ol className={styles.list}>
      {items.map(item => (
        <li key={item.link.href} className={styles.item}>
          <AppLink {...item.link} className={styles.link}>
            {item.label}
          </AppLink>
          <span aria-hidden={true}>/</span>
        </li>
      ))}

      <li className={styles.item}>
        <span className={styles.current} aria-current="page">
          {current}
        </span>
      </li>
    </ol>
  </nav>
)
