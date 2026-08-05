import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { type FC } from 'react'
import type { IAlertProps, IBasicStyling } from '../../types'
import { APPEAR_OFFSET, APPEAR_TRANSITION } from '../../utils/motion'
import { IconClose } from '../../svg/icons'
import { IconButton } from '../icon-button'
import * as styles from './Alert.css'

/**
 * Сообщение об ошибке или результате действия.
 *
 * `role` зависит от тона: ошибка объявляется скринридером немедленно
 * (`alert`), нейтральное сообщение — деликатно, не перебивая пользователя
 * (`status`). Это разные `aria-live`, и путать их не стоит.
 *
 * Появление анимировано прямо здесь, а не обёрткой снаружи: сообщение
 * всегда возникает в ответ на действие и всегда сдвигает форму под собой —
 * без проявления этот сдвиг читается как подёргивание страницы. Обёртку
 * `Appear` тут применить нельзя: она добавила бы лишний блок между `alert`
 * и его контейнером в тех местах, где алерт стоит в сетке.
 */
export const Alert: FC<IAlertProps & IBasicStyling> = ({
  children,
  title,
  tone = 'info',
  action,
  onClose,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false

  return (
    <motion.div
      className={clsx(styles.container, styles.tone[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
      initial={
        isReduced ? { opacity: 0 } : { opacity: 0, transform: `translateY(${APPEAR_OFFSET}px)` }
      }
      animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
      transition={APPEAR_TRANSITION}
    >
      <div className={styles.body}>
        {title !== undefined && <span className={styles.title}>{title}</span>}
        <span className={styles.message}>{children}</span>

        {action !== undefined && <div className={styles.action}>{action}</div>}
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
    </motion.div>
  )
}
