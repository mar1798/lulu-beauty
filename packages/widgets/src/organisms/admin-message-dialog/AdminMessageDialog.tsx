import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IAdminMessageDialogProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { Modal } from '../modal'
import * as styles from './AdminMessageDialog.css'

/**
 * Сообщение покупателю через бота — для того, кого по номеру в Telegram не
 * найти: поиск по номеру человек может закрыть настройками приватности, а чат с
 * ботом от номера не зависит.
 *
 * Клик мимо окна его не закрывает (`isDismissable={false}`): за ним набранный
 * текст, и промах мимо кнопки не должен его выбрасывать. Ошибка отправки
 * остаётся внутри окна по той же причине — текст на месте, можно повторить.
 *
 * Пустой текст не отправляется: кнопка неактивна, пока в поле одни пробелы.
 */
export const AdminMessageDialog: FC<IAdminMessageDialogProps & IBasicStyling> = ({
  isOpen,
  customerName,
  orderNumber,
  value,
  onChange,
  maxLength,
  isBusy = false,
  error = null,
  onSend,
  onClose,
  className,
}) => (
  <Modal
    className={clsx(styles.container, className)}
    isOpen={isOpen}
    onClose={onClose}
    title="Написать через бота"
    size="sm"
    isDismissable={false}
    footer={
      <>
        <Button variant="secondary" disabled={isBusy} onClick={onClose}>
          Отмена
        </Button>
        <Button isLoading={isBusy} disabled={value.trim() === ''} onClick={onSend}>
          Отправить
        </Button>
      </>
    }
  >
    <div className={styles.body}>
      <Text tone="secondary">
        {customerName}, заявка № {orderNumber}. Бот пришлёт текст с номером заявки и кнопкой
        «Ответить» - ответ покупателя придёт вам в чат с ботом
      </Text>

      <Textarea
        label="Сообщение"
        value={value}
        onChange={onChange}
        rows={5}
        maxLength={maxLength}
        disabled={isBusy}
        required={true}
      />

      {error !== null && (
        <Alert tone="danger" title="Не отправлено">
          {error}
        </Alert>
      )}
    </div>
  </Modal>
)
