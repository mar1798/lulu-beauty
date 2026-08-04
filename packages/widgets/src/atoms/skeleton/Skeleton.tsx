import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ISkeletonProps } from '../../types'
import * as styles from './Skeleton.css'

/**
 * Заглушка на время загрузки. Размеры приходят пропсами, а не классами:
 * скелетон всегда подгоняется под конкретное место (карточка товара,
 * строка таблицы), и заводить под каждое отдельный класс бессмысленно.
 *
 * Для скринридера скелетон скрыт — озвучивать «загрузка» должен контейнер.
 */
export const Skeleton: FC<ISkeletonProps & IBasicStyling> = ({
  width = '100%',
  height,
  shape = 'text',
  className,
}) => (
  <span
    className={clsx(styles.container, styles.shape[shape], className)}
    style={{ width, height }}
    aria-hidden={true}
  />
)
