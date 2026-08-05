import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type FC } from 'react'
import type { IBasicStyling, IToastViewportProps } from '../../types'
import { Portal } from '../../atoms/portal'
import { Toast } from '../../molecules/toast'
import { TOAST_TRANSITION } from '../../utils/motion'
import * as styles from './ToastViewport.css'

/**
 * Стопка уведомлений в углу экрана.
 *
 * Контейнер прозрачен для мыши (`pointer-events: none`), а клики принимает
 * только сам тост: иначе невидимая колонка перехватывала бы нажатия по
 * странице под ней даже когда уведомлений нет.
 *
 * Порядок — снизу вверх: свежий тост появляется у нижнего края, где взгляд
 * уже был, а не сдвигает предыдущие.
 */
export const ToastViewport: FC<IToastViewportProps & IBasicStyling> = ({
  toasts,
  onDismiss,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false

  return (
    <Portal>
      <div className={clsx(styles.container, className)}>
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              layout={!isReduced}
              initial={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
              animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
              exit={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
              transition={TOAST_TRANSITION}
            >
              <Toast toast={toast} onDismiss={onDismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  )
}
