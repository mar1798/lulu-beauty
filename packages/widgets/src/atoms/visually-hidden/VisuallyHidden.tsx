import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IVisuallyHiddenProps } from '../../types'
import * as styles from './VisuallyHidden.css'

/**
 * Текст только для скринридера: подпись иконочной кнопки, статус загрузки,
 * заголовок секции. Из потока не выпадает и остаётся доступным поиску по
 * странице у ассистивных технологий — в отличие от `display: none`.
 */
export const VisuallyHidden: FC<IVisuallyHiddenProps & IBasicStyling> = ({
  children,
  className,
}) => <span className={clsx(styles.container, className)}>{children}</span>
