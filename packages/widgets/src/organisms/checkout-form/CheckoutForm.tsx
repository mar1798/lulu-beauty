import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, ICheckoutFormProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Divider } from '../../atoms/divider'
import { Price } from '../../atoms/price'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { DeadlineCountdown } from '../../molecules/deadline-countdown'
import * as styles from './CheckoutForm.css'

/**
 * Оформление заявки: комментарий и подтверждение.
 *
 * Лимит комментария — 2000 символов, ровно как на бэке (`CheckoutRequest`),
 * и `Textarea` показывает счётчик: упереться в предел молча хуже, чем
 * видеть остаток.
 */

const NOTE_MAX_LENGTH = 2000

export const CheckoutForm: FC<ICheckoutFormProps & IBasicStyling> = ({
  totalCents,
  itemCount,
  deadlineAt = null,
  onSubmit,
  isLoading = false,
  isSubmitting = false,
  error,
  className,
}) => {
  const [note, setNote] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onSubmit(note.trim() === '' ? null : note.trim())
  }

  /*
    Скелетон повторяет ту же карточку: таймер, итог, поле комментария и
    кнопка. Так после ответа не переставляется ничего, кроме содержимого.
  */
  if (isLoading) {
    return (
      <div className={clsx(styles.form, className)} aria-busy={true}>
        <Skeleton shape="block" width="100%" height={72} />

        <div className={styles.totalRow}>
          <Skeleton width="35%" height={20} />
          <Skeleton width="25%" height={24} />
        </div>

        <Divider />

        <Skeleton shape="block" width="100%" height={132} />

        <div className={styles.submitSkeleton}>
          <Skeleton shape="block" width="100%" height={48} />
        </div>
      </div>
    )
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Заявка не оформилась">
          {error}
        </Alert>
      )}

      {deadlineAt !== null && <DeadlineCountdown deadlineAt={deadlineAt} />}

      <div className={styles.totalRow}>
        <Text weight="medium">{`Товаров: ${itemCount}`}</Text>
        <Price priceCents={totalCents} size="lg" />
      </div>

      <Divider />

      <Textarea
        label="Комментарий к заявке"
        hint="Необязательно: пожелания по доставке, оттенкам, срокам"
        value={note}
        onChange={setNote}
        maxLength={NOTE_MAX_LENGTH}
        rows={4}
        disabled={isSubmitting}
      />

      <Button type="submit" className={styles.submit} isLoading={isSubmitting}>
        Отправить заявку
      </Button>

      <Text size="sm" tone="muted">
        Это не оплата. После закрытия сбора владелец подтвердит заявку — уведомление
        придёт в Telegram.
      </Text>
    </form>
  )
}
