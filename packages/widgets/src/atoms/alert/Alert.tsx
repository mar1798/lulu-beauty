import clsx from 'clsx'
import { type FC } from 'react'
import type { IAlertProps, IBasicStyling } from '../../types'
import { IconClose } from '../../svg/icons'
import { IconButton } from '../icon-button'
import * as styles from './Alert.css'

/**
 * Сообщение об ошибке или результате действия.
 *
 * `role` зависит от тона: ошибка объявляется скринридером немедленно
 * (`alert`), нейтральное сообщение — деликатно, не перебивая пользователя
 * (`status`). Это разные `aria-live`, и путать их не стоит.
 */
export const Alert: FC<IAlertProps & IBasicStyling> = ({
  children,
  title,
  tone = 'info',
  onClose,
  className,
}) => (
  <div
    className={clsx(styles.container, styles.tone[tone], className)}
    role={tone === 'danger' ? 'alert' : 'status'}
  >
    <div className={styles.body}>
      {title !== undefined && <span className={styles.title}>{title}</span>}
      <span className={styles.message}>{children}</span>
    </div>

    {onClose !== undefined && (
      <IconButton
        className={styles.close}
        size="sm"
        variant="ghost"
        icon={<IconClose />}
        label="Закрыть сообщение"
        onClick={onClose}
      />
    )}
  </div>
)
