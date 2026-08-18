import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStatusPanelProps } from '../../types'
import * as styles from './StatusPanel.css'

/**
 * Карточка состояния сбора в герое. Первая реализация набирала таймер кеглем
 * заголовка — и он всё равно терялся: рядом с display-заголовком и фоновым
 * пятном выигрывает не размер, а смена материала. Белая поверхность с
 * марочной рамкой и тенью на плоском холсте выделяется мгновенно и не
 * спорит с `h1` за иерархию.
 *
 * Панель не знает ни про сбор, ни про таймер — метка, живая точка и место
 * под содержимое, поэтому ею же рисуется и состояние «сбора нет».
 */
export const StatusPanel: FC<IStatusPanelProps & IBasicStyling> = ({
  label,
  isLive = false,
  tone = 'brand',
  children,
  className,
}) => (
  <div className={clsx(styles.container, styles.tone[tone], className)}>
    <span className={clsx(styles.label, styles.labelTone[tone])}>
      {isLive && <span className={styles.dot} aria-hidden={true} />}
      {label}
    </span>

    <div className={styles.content}>{children}</div>
  </div>
)
