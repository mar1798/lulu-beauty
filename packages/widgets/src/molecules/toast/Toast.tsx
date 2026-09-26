import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IToastProps } from '../../types'
import { IconClose } from '../../svg/icons'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import * as styles from './Toast.css'

/**
 * Короткое уведомление о результате действия.
 *
 * Роли `alert`/`status` у самого тоста нет: озвучивают уведомление постоянные
 * live-регионы `ToastViewport` — тост, вставленный уже заполненным, скринридеры
 * пропускают.
 *
 * `toast.action` — обратный ход («Вернуть» после удаления). Нажатие закрывает
 * уведомление сразу: результат самого запроса придёт следующим тостом, а
 * висящее уведомление с уже нажатой кнопкой читается как «не сработало».
 */
export const Toast: FC<IToastProps & IBasicStyling> = ({ toast, onDismiss, className }) => (
  <div className={clsx(styles.container, styles.tone[toast.tone], className)}>
    <div className={styles.body}>
      <span className={styles.title}>{toast.title}</span>
      {toast.subject !== undefined && <span className={styles.subject}>{toast.subject}</span>}
      {toast.description !== undefined && (
        <span className={styles.description}>{toast.description}</span>
      )}
    </div>

    <div className={styles.controls}>
      {toast.action !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            toast.action?.onAction()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </Button>
      )}

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
  </div>
)
