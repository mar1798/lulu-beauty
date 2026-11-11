import clsx from 'clsx'
import { type FC, useEffect, useState } from 'react'
import type {
  DiscountKind,
  IAdminOrder,
  IAdminOrderDiscountDialogProps,
  IBasicStyling,
  IDiscountFields,
  ISelectOption,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Price } from '../../atoms/price'
import { Select } from '../../atoms/select'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { orderStatusLabel } from '../../molecules/order-status-badge'
import {
  DISCOUNT_NOTE_MAX_LENGTH,
  MAX_DISCOUNT_PERCENT,
  formatDiscount,
} from '../../utils/discount'
import { parsePrice, priceOnly, priceToInput } from '../../utils/priceInput'
import { formatVariant } from '../../utils/variants'
import { adminOrderNumber } from '../admin-orders-table'
import { Modal } from '../modal'
import * as styles from './AdminOrderDiscountDialog.css'

/**
 * Скидка на заявку покупателя: на одну строку или на всю заявку, процентом
 * или суммой в сомах, с причиной.
 *
 * Причину видит и покупатель — в сообщении бота и в заявке на сайте, — поэтому
 * подсказка под полем говорит об этом до того, как её напишут.
 *
 * У строки и у заявки скидка одна: новая заменяет прежнюю. Если у выбранной
 * цели скидка уже стоит, поля заполняются ею — её можно поправить или снять.
 *
 * У выбранной строки сразу под списком — цена за штуку, количество и сумма
 * строки: от них админ и прикидывает, какую скидку может дать. В списке строки
 * узнаются по миниатюре товара.
 *
 * Внизу — сумма заявки до и после. Её считает бэкенд: окно отдаёт набранное в
 * `onDraftChange`, страница спрашивает `.../discount/preview` и возвращает
 * ответ в `preview`, — так админ подтверждает ровно то число, которое уйдёт
 * покупателю. Само подтверждение спрашивает страница — окно только собирает
 * скидку и отдаёт её в `onSubmit`.
 *
 * Пока чек по счёту ждёт проверки, окно скидку не даёт и не снимает: деньги
 * уже ушли, и новая сумма к оплате за ними не успеет. Сначала решите с чеком.
 *
 * Отказы бэкенда («больше суммы», «округлилась до нуля», «скидке на заявку не
 * останется места») приходят тем же ответом (`preview.error`) и видны у поля
 * до «Дать скидку».
 * Та же скидка с той же причиной — не изменение, и кнопка недоступна.
 *
 * Клик мимо окна его не закрывает (`isDismissable={false}`): за ним набранное.
 */

/** Значение `Select` для «вся заявка» — у строк там их `id`. */
const WHOLE_ORDER = ''

const KIND_OPTIONS: ISelectOption[] = [
  { value: 'PERCENT', label: 'Процент' },
  { value: 'AMOUNT', label: 'Сумма, сом' },
]

const PERCENT_MAX_LENGTH = String(MAX_DISCOUNT_PERCENT).length

interface IFields {
  kind: DiscountKind
  value: string
  note: string
}

const EMPTY: IFields = { kind: 'PERCENT', value: '', note: '' }

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

/** Скидка, которая уже стоит у цели, — строки (`itemId`) или заявки (`null`). */
const currentOf = (order: IAdminOrder, itemId: string | null): IDiscountFields | null => {
  const holder = itemId === null ? order : order.items.find(item => item.id === itemId)

  return holder === undefined || holder.discountKind === null ? null : holder
}

/** Поля, заполненные скидкой цели, — или пустые, если её нет. */
const fieldsOf = (current: IDiscountFields | null): IFields => {
  if (current?.discountKind == null || current.discountValue === null) {
    return EMPTY
  }

  return {
    kind: current.discountKind,
    value:
      current.discountKind === 'PERCENT'
        ? String(current.discountValue)
        : priceToInput(current.discountValue),
    note: current.discountNote ?? '',
  }
}

export const AdminOrderDiscountDialog: FC<IAdminOrderDiscountDialogProps & IBasicStyling> = ({
  isOpen,
  onClose,
  order,
  isBusy = false,
  error = null,
  onSubmit,
  onRemove,
  onDraftChange,
  preview,
  className,
}) => {
  const [target, setTarget] = useState(WHOLE_ORDER)
  const [fields, setFields] = useState<IFields>(EMPTY)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // Каждое открытие начинается со всей заявки и её текущей скидки.
  useEffect(() => {
    if (isOpen && order !== null) {
      setTarget(WHOLE_ORDER)
      setFields(fieldsOf(currentOf(order, null)))
      setIsSubmitted(false)
    }
    // Заявку не слушаем: таблица перечитывается, пока окно открыто, и набранное
    // пропало бы на каждой ревалидации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const itemId = target === WHOLE_ORDER ? null : target
  const current = order === null ? null : currentOf(order, itemId)
  const targetItem = order?.items.find(item => item.id === itemId)
  const hasReceipt = order?.hasReceipt === true

  const value =
    fields.kind === 'PERCENT'
      ? fields.value === ''
        ? null
        : Number(fields.value)
      : parsePrice(fields.value)

  const inputError =
    fields.kind === 'PERCENT'
      ? value === null || value < 1 || value > MAX_DISCOUNT_PERCENT
        ? `Процент от 1 до ${MAX_DISCOUNT_PERCENT}`
        : null
      : value === null || value <= 0
        ? 'Сумма в сомах, например 500 или 250.50'
        : null

  const draftValue = inputError === null ? value : null

  // Набранное уходит странице на расчёт; пока окно закрыто, считать нечего.
  useEffect(() => {
    if (!isOpen) {
      return
    }

    onDraftChange(draftValue === null ? null : { itemId, kind: fields.kind, value: draftValue })
    // `onDraftChange` страница пересоздаёт на каждый рендер — слушаем только набранное.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId, fields.kind, draftValue])

  // Ответ на прежнее набранное — уже не про это: пока считается, ни суммы, ни отказа.
  const valueError = inputError ?? (preview.isPending ? null : preview.error)

  const note = fields.note.trim()
  const isUnchanged =
    current !== null &&
    current.discountKind === fields.kind &&
    current.discountValue === value &&
    (current.discountNote ?? '') === note

  const totalAfter =
    order === null || valueError !== null || preview.isPending ? null : preview.totalCents

  const targetOptions: ISelectOption[] =
    order === null
      ? []
      : [
          { value: WHOLE_ORDER, label: 'Всю заявку' },
          ...order.items.map(item => {
            const variant = formatVariant(item.productVolumeMl, item.productShade)

            return {
              value: item.id,
              label: `${item.productName}${variant === null ? '' : `, ${variant}`} × ${item.quantity}`,
              imageUrl: item.productImageUrl,
            }
          }),
        ]

  const chooseTarget = (next: string): void => {
    setTarget(next)
    setIsSubmitted(false)

    if (order !== null) {
      setFields(fieldsOf(currentOf(order, next === WHOLE_ORDER ? null : next)))
    }
  }

  const handleSubmit = (): void => {
    setIsSubmitted(true)

    if (valueError !== null || draftValue === null || isUnchanged || hasReceipt) {
      return
    }

    onSubmit({ itemId, kind: fields.kind, value: draftValue, note: note === '' ? null : note })
  }

  return (
    <Modal
      className={clsx(styles.container, className)}
      isOpen={isOpen}
      onClose={onClose}
      title={order === null ? 'Скидка' : `Скидка по заявке № ${adminOrderNumber(order.id)}`}
      size="md"
      isDismissable={false}
      footer={
        <>
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            Отмена
          </Button>
          <Button isLoading={isBusy} disabled={isUnchanged || hasReceipt} onClick={handleSubmit}>
            {current === null ? 'Дать скидку' : 'Изменить скидку'}
          </Button>
        </>
      }
    >
      {order !== null && (
        <div className={styles.body}>
          <div className={styles.section}>
            <Text size="sm">
              <Text as="span" size="sm" weight="medium">
                {order.customerName}
              </Text>
              {` · ${orderStatusLabel(order.status)}`}
            </Text>

            {order.status === 'AWAITING_PAYMENT' && (
              <Text size="sm" tone="muted">
                Счёт уже отправлен - покупатель получит новую сумму к оплате
              </Text>
            )}

            {isUnchanged && (
              <Text size="sm" tone="muted">
                Скидка уже такая - измените размер или причину
              </Text>
            )}

            {!order.canMessage && (
              <Text size="sm" tone="muted">
                Покупатель не привязан к боту - сообщение о скидке ему не придёт
              </Text>
            )}
          </div>

          {hasReceipt && (
            <Alert tone="warning" title="Чек на проверке">
              Покупатель уже прислал чек по этому счёту - сначала примите или отклоните его в боте,
              потом меняйте скидку
            </Alert>
          )}

          <Select
            label="Скидка на"
            value={target}
            options={targetOptions}
            disabled={isBusy}
            onChange={chooseTarget}
          />

          {/*
            Цена выбранной строки — от неё и считают, какую скидку можно дать:
            в списке она не помещается рядом с длинным названием.
          */}
          {targetItem !== undefined && (
            <div className={styles.linePrice}>
              <div className={styles.lineMeta}>
                <Price priceCents={targetItem.productPriceCents} size="sm" />
                <Text size="sm" tone="muted">{`× ${targetItem.quantity} шт`}</Text>
              </div>
              <Price priceCents={targetItem.lineTotalCents} />
            </div>
          )}

          {current?.discountKind != null && current.discountValue !== null && (
            <div className={styles.current}>
              <Text size="sm">
                {`Сейчас: скидка ${formatDiscount(current.discountKind, current.discountValue)}`}
                {current.discountNote === null ? '' : ` - ${current.discountNote}`}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy || hasReceipt}
                onClick={() => {
                  onRemove(itemId)
                }}
              >
                Снять скидку
              </Button>
            </div>
          )}

          <div className={styles.numbers}>
            <Select
              label="Вид скидки"
              value={fields.kind}
              options={KIND_OPTIONS}
              disabled={isBusy}
              onChange={next => {
                setFields(currentFields => ({
                  ...currentFields,
                  kind: next as DiscountKind,
                  value: '',
                }))
                setIsSubmitted(false)
              }}
            />

            <Input
              label={fields.kind === 'PERCENT' ? 'Размер, %' : 'Размер, сом'}
              value={fields.value}
              inputMode={fields.kind === 'PERCENT' ? 'numeric' : 'decimal'}
              maxLength={fields.kind === 'PERCENT' ? PERCENT_MAX_LENGTH : undefined}
              required={true}
              disabled={isBusy}
              error={isSubmitted ? valueError : null}
              onChange={next => {
                setFields(currentFields => ({
                  ...currentFields,
                  value: currentFields.kind === 'PERCENT' ? digitsOnly(next) : priceOnly(next),
                }))
              }}
            />
          </div>

          <Textarea
            label="Причина"
            hint="Покупатель увидит её в сообщении бота и в заявке на сайте"
            value={fields.note}
            rows={3}
            maxLength={DISCOUNT_NOTE_MAX_LENGTH}
            disabled={isBusy}
            onChange={next => {
              setFields(currentFields => ({ ...currentFields, note: next }))
            }}
          />

          <div className={styles.totalRow}>
            <Text weight="medium">Сумма заявки</Text>
            <div className={styles.totals}>
              {totalAfter !== null && totalAfter !== order.totalCents && (
                <Text size="sm" tone="muted">
                  {'Было '}
                  <Price priceCents={order.totalCents} size="sm" />
                </Text>
              )}
              <Price priceCents={totalAfter ?? order.totalCents} size="lg" />
            </div>
          </div>

          {error !== null && (
            <Alert tone="danger" title="Скидка не сохранена">
              {error}
            </Alert>
          )}
        </div>
      )}
    </Modal>
  )
}
