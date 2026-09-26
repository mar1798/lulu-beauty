import clsx from 'clsx'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
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
 *
 * `onPause`/`onResume` — остановка отсчёта, пока стопкой занимаются: курсор на
 * ней или фокус внутри. Слушает контейнер, а не отдельный тост, потому что
 * останавливается стопка целиком.
 */
export const ToastViewport: FC<IToastViewportProps & IBasicStyling> = ({
  toasts,
  onDismiss,
  onPause,
  onResume,
  politeAnnouncement = '',
  assertiveAnnouncement = '',
  className,
}) => {
  const isReduced = useReducedMotion() ?? false

  return (
    <Portal>
      {/*
        Озвучивают уведомления эти две области, а не сами тосты: они стоят в
        документе постоянно и меняют только текст — так скринридер их слышит.
        Ошибка перебивает чтение, остальное дожидается паузы.
      */}
      <div className={styles.liveRegion} role="status" aria-live="polite" aria-atomic={true}>
        {politeAnnouncement}
      </div>
      <div className={styles.liveRegion} role="alert" aria-live="assertive" aria-atomic={true}>
        {assertiveAnnouncement}
      </div>

      {/*
        События приходят от самих тостов — контейнер прозрачен для мыши и
        целью указателя не бывает, — но всплывают до него, и React считает
        `enter`/`leave` по общему предку: переход между соседними тостами
        паузу не снимает. `onFocus`/`onBlur` всплывают так же (`focusin`).
      */}
      <div
        className={clsx(styles.container, className)}
        onPointerEnter={onPause}
        onPointerLeave={onResume}
        onFocus={onPause}
        onBlur={onResume}
      >
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <m.div
              key={toast.id}
              layout={!isReduced}
              initial={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
              animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
              exit={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
              transition={TOAST_TRANSITION}
            >
              <Toast toast={toast} onDismiss={onDismiss} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  )
}
