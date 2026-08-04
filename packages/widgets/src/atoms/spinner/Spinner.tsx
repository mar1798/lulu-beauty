import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ISpinnerProps } from '../../types'
import { VisuallyHidden } from '../visually-hidden'
import * as styles from './Spinner.css'

/**
 * Индикатор загрузки. Цвет наследуется от родителя (`currentColor`),
 * поэтому спиннер внутри кнопки автоматически совпадает с её текстом.
 *
 * `label` озвучивается скринридером; когда спиннер стоит внутри уже
 * помеченного `aria-busy` контейнера, его можно погасить (`label={null}`),
 * чтобы не дублировать сообщение.
 */
export const Spinner: FC<ISpinnerProps & IBasicStyling> = ({
  size = 'md',
  label = 'Загрузка',
  className,
}) => (
  <span className={clsx(styles.container, styles.size[size], className)} role="status">
    {label !== null && <VisuallyHidden>{label}</VisuallyHidden>}
  </span>
)
