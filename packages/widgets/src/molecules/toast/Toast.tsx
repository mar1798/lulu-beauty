import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IToastProps } from '../../types'
import { IconClose } from '../../svg/icons'
import { IconButton } from '../../atoms/icon-button'
import * as styles from './Toast.css'

/**
 * Короткое уведомление о результате действия.
 *
 * `role` зависит от тона, как и у `Alert`: ошибка перебивает чтение
 * (`alert`), успех — нет (`status`). Уведомление об успехе, зачитанное
 * поверх того, что человек читает, раздражает сильнее, чем помогает.
 */
export const Toast: FC<IToastProps & IBasicStyling> = ({ toast, onDismiss, className }) => (
  <div
    className={clsx(styles.container, styles.tone[toast.tone], className)}
    role={toast.tone === 'danger' ? 'alert' : 'status'}
  >
    <div className={styles.body}>
      <span className={styles.title}>{toast.title}</span>
      {toast.description !== undefined && (
        <span className={styles.description}>{toast.description}</span>
      )}
    </div>

    <IconButton
      className={styles.close}
      icon={<IconClose />}
      label="Скрыть уведомление"
      size="sm"
      variant="ghost"
      onClick={() => {
        onDismiss(toast.id)
      }}
    />
  </div>
)
