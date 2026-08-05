import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IConfirmDialogProps } from '../../types'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import { Modal } from '../modal'
import * as styles from './ConfirmDialog.css'

/**
 * Подтверждение необратимого действия поверх `Modal`.
 *
 * Клик мимо окна закрытия не отменяет (`isDismissable={false}`): промах мимо
 * кнопки не должен читаться как «отмена» — из двух исходов пользователь
 * обязан выбрать явно. Отмена остаётся на кнопке, крестике и Escape.
 */
export const ConfirmDialog: FC<IConfirmDialogProps & IBasicStyling> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  isBusy = false,
  onConfirm,
  onCancel,
  className,
}) => (
  <Modal
    className={clsx(styles.container, className)}
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    size="sm"
    isDismissable={false}
    footer={
      <>
        <Button variant="secondary" disabled={isBusy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          isLoading={isBusy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    {typeof description === 'string' ? (
      <Text tone="secondary">{description}</Text>
    ) : (
      (description ?? null)
    )}
  </Modal>
)
