import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IDividerProps } from '../../types'
import * as styles from './Divider.css'

/**
 * Разделитель. Декоративный по умолчанию (`role="presentation"`): линия
 * между блоками ничего не сообщает скринридеру и только засоряет вывод.
 * Осмысленное разделение секций включается через `isSemantic`.
 */
export const Divider: FC<IDividerProps & IBasicStyling> = ({
  orientation = 'horizontal',
  isSemantic = false,
  className,
}) => (
  <hr
    className={clsx(styles.container, styles.orientation[orientation], className)}
    role={isSemantic ? 'separator' : 'presentation'}
    aria-orientation={isSemantic ? orientation : undefined}
  />
)
