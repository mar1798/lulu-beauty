import clsx from 'clsx'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { type FC, useEffect, useId } from 'react'
import type { IBasicStyling, IModalProps } from '../../types'
import { IconClose } from '../../svg/icons'
import { IconButton } from '../../atoms/icon-button'
import { Portal } from '../../atoms/portal'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useBackDismiss } from '../../hooks/useBackDismiss'
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import { DIALOG_TRANSITION, OVERLAY_TRANSITION } from '../../utils/motion'
import * as styles from './Modal.css'

/**
 * Модальное окно: затемнение, ловушка фокуса, блокировка прокрутки.
 *
 * Закрытие есть тремя способами — крестик, Escape и клик мимо окна; последний
 * отключается там, где за ним стоит заполненная форма. Escape слушается на
 * `document`, а не на самом окне: фокус может уехать в поле внутри портала,
 * и обработчик на контейнере до него бы не добрался.
 *
 * `aria-modal` + `role="dialog"` вместе с ловушкой фокуса — минимум, при
 * котором скринридер не читает содержимое страницы под окном.
 */
export const Modal: FC<IModalProps & IBasicStyling> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  isDismissable = true,
  className,
}) => {
  const titleId = useId()
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen)
  const isReduced = useReducedMotion() ?? false

  useLockBodyScroll(isOpen)

  /*
    «Назад» закрывает окно — но только то, которое можно закрыть кликом мимо: за
    недисмиссабельным стоит заполненная форма, и жест уводит со страницы, как и
    раньше, а не молча выбрасывает набранное.
  */
  const requestClose = useBackDismiss(isOpen && isDismissable, onClose)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        requestClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, requestClose])

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <m.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_TRANSITION}
            onMouseDown={event => {
              /*
                Именно `mousedown` и именно по самому фону: `click` сработал бы
                и тогда, когда выделение текста началось внутри окна, а кнопка
                мыши отпущена снаружи.
              */
              if (isDismissable && event.target === event.currentTarget) {
                requestClose()
              }
            }}
          >
            <m.div
              ref={dialogRef}
              className={clsx(styles.dialog, styles.size[size], className)}
              role="dialog"
              aria-modal={true}
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
              animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'scale(1)' }}
              exit={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.98)' }}
              transition={DIALOG_TRANSITION}
            >
              <div className={styles.head}>
                <h2 className={styles.title} id={titleId}>
                  {title}
                </h2>

                <IconButton
                  className={styles.close}
                  icon={<IconClose />}
                  label="Закрыть"
                  size="sm"
                  variant="ghost"
                  onClick={requestClose}
                />
              </div>

              <div className={styles.body}>{children}</div>

              {footer !== undefined && <div className={styles.footer}>{footer}</div>}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
