import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IFooterProps } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Container } from '../../atoms/container'
import * as styles from './Footer.css'

/**
 * Подвал: колонки ссылок и служебная строка внизу.
 *
 * `marginTop: auto` в стилях — чтобы подвал прижимался к низу на коротких
 * страницах: `#__next` уже растянут во всю высоту колонкой (`global.css.ts`).
 */
export const Footer: FC<IFooterProps & IBasicStyling> = ({
  columns,
  copyright,
  note,
  className,
}) => (
  <footer className={clsx(styles.container, className)}>
    <Container as="div" className={styles.inner}>
      <div className={styles.columns}>
        {columns.map(column => (
          <div key={column.title} className={styles.column}>
            <span className={styles.title}>{column.title}</span>

            {column.links.map(item => (
              <AppLink key={item.link.href} {...item.link} className={styles.link}>
                {item.label}
              </AppLink>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.bottom}>
        <span className={styles.note}>{copyright}</span>
        {note !== undefined && <span className={styles.note}>{note}</span>}
      </div>
    </Container>
  </footer>
)
