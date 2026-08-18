import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHomeCtaProps } from '../../types'
import * as styles from './HomeCta.css'

/**
 * Финальный блок-якорь главной: страница заканчивается одним действием,
 * а не подвалом.
 *
 * Про Telegram виджет ничего не знает — кнопки и их адреса приходят слотом
 * со страницы, поэтому имя `HomeCta`, а не `TelegramCta`.
 */
export const HomeCta: FC<IHomeCtaProps & IBasicStyling> = ({
  eyebrow,
  title,
  description,
  actions,
  note,
  background,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {background !== undefined && background}

    <div className={styles.body}>
      {eyebrow !== undefined && <span className={styles.eyebrow}>{eyebrow}</span>}

      <h2 className={styles.title}>{title}</h2>

      {description !== undefined && <p className={styles.description}>{description}</p>}

      <div className={styles.actions}>{actions}</div>

      {note !== undefined && <p className={styles.note}>{note}</p>}
    </div>
  </div>
)
