import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, I__name__Props } from '../../types'
import * as styles from './__name__.css'

export const __name__: FC<I__name__Props & IBasicStyling> = ({ className }) => {
  return <div className={clsx(styles.container, className)}></div>
}
