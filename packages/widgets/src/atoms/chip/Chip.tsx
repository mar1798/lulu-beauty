import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IChipProps } from '../../types'
import * as styles from './Chip.css'

/**
 * Переключатель фильтра (категория каталога).
 *
 * Это кнопка-тумблер, поэтому состояние передаётся через `aria-pressed`, а не
 * через один только цвет: скринридер обязан отличать выбранный фильтр,
 * а по контрасту он этого не сделает.
 */
export const Chip: FC<IChipProps & IBasicStyling> = ({
  label,
  isSelected = false,
  count,
  disabled = false,
  isBlock = false,
  onToggle,
  className,
}) => (
  <button
    type="button"
    className={clsx(styles.container, isBlock && styles.block, className)}
    aria-pressed={isSelected}
    disabled={disabled}
    onClick={() => onToggle(!isSelected)}
  >
    {label}
    {count !== undefined && <span className={styles.count}>{count}</span>}
  </button>
)
