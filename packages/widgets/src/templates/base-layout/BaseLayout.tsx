import clsx from 'clsx'
import { type FC } from 'react'
import type { IBaseLayoutProps, IBasicStyling } from '../../types'
import * as styles from './BaseLayout.css'

/**
 * Каркас страницы: шапка, содержимое, подвал.
 *
 * Шапка и подвал приходят слотами, а не собираются внутри: конкретные
 * `Header`/`Footer` уже настроены данными в `apps/website`, и шаблону
 * незачем знать ни про навигацию, ни про пользователя.
 */

const MAIN_ID = 'main-content'

export const BaseLayout: FC<IBaseLayoutProps & IBasicStyling> = ({
  header,
  footer,
  children,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <a className={styles.skipLink} href={`#${MAIN_ID}`}>
      К содержимому
    </a>

    {header}

    <main className={styles.main} id={MAIN_ID}>
      {children}
    </main>

    {footer}
  </div>
)
