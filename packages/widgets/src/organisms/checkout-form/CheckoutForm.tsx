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
import { PromotionLines } from '../../molecules/promotion-lines'
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
  promotions,
  code = null,
  buildPromotionHref,
  promoCode,
  deadlineAt = null,
  onSubmit,
  isLoading = false,
  isSubmitting = false,
  error,
  className,
}) => {
  const [note, setNote] = useState('')
  const hasDiscount = promotions !== undefined && promotions.discountCents > 0

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
      {deadlineAt !== null && <DeadlineCountdown deadlineAt={deadlineAt} />}

      <div className={styles.totalRow}>
        <Text weight="medium">{`Товаров: ${itemCount}`}</Text>
        <Price priceCents={totalCents} size="lg" />
      </div>

      {/*
        Со скидками «Товаров» остаётся суммой до них, под ним строки скидок, а
        «К оплате» - число сервера. Сами скидки форма не считает и не округляет.
      */}
      {hasDiscount && promotions !== undefined && (
        <>
          <PromotionLines
            promotions={promotions}
            kind="discounts"
            code={code}
            buildPromotionHref={buildPromotionHref}
          />

          <div className={styles.totalRow}>
            <Text weight="medium">К оплате</Text>
            <Price priceCents={promotions.payableCents} size="lg" />
          </div>
        </>
      )}

      <Divider />

      {promoCode}

      <Textarea
        label="Комментарий к заявке"
        hint="Необязательно: пожелания по доставке, оттенкам, срокам"
        value={note}
        onChange={setNote}
        maxLength={NOTE_MAX_LENGTH}
        rows={4}
        disabled={isSubmitting}
      />

      {/*
        Ошибка — вплотную к кнопке, а не над формой: на телефоне верх формы в
        этот момент за краем экрана, и после «Отправить заявку» не было видно
        ничего — ни ошибки, ни того, ушла ли заявка.
      */}
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Заявка не оформилась">
          {error}
        </Alert>
      )}

      <Button type="submit" className={styles.submit} isLoading={isSubmitting}>
        Отправить заявку
      </Button>

      <Text size="sm" tone="muted">
        Это не оплата. После закрытия сбора мы подтвердим заявку - уведомление придёт в Telegram.
      </Text>
    </form>
  )
}
