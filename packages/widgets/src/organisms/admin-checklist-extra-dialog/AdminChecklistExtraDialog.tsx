import clsx from 'clsx'
import { type FC, useEffect, useState } from 'react'
import type { IAdminChecklistExtraDialogProps, IBasicStyling } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Modal } from '../modal'
import { MAX_PRICE_CENTS, parsePrice, priceOnly } from '../../utils/priceInput'
import * as styles from './AdminChecklistExtraDialog.css'

/**
 * «Добавить пункт» в чек-лист закупки — то, чего нет ни в одной заявке:
 * пакеты для выдачи, тестер, что-то для самого магазина.
 *
 * Три поля: название, количество и цена за штуку. Цена по умолчанию 0 — её
 * часто не знают, пока не дошли до полки, — но вписать можно сразу, и тогда
 * она входит в итог списка.
 *
 * Клик мимо окна его не закрывает (`isDismissable={false}`): за ним набранное.
 * Ошибка сохранения остаётся внутри окна по той же причине. Поля сбрасываются
 * при каждом открытии — новый пункт начинается с чистой формы.
 */

/** `String(255)` у названия на бэкенде. */
const NAME_MAX_LENGTH = 255

/** `MAX_ITEM_QUANTITY` бэкенда. */
const MAX_QUANTITY = 999

const QUANTITY_MAX_LENGTH = String(MAX_QUANTITY).length

const EMPTY = { name: '', quantity: '1', price: '0' }

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

export const AdminChecklistExtraDialog: FC<IAdminChecklistExtraDialogProps & IBasicStyling> = ({
  isOpen,
  isBusy = false,
  error = null,
  onSubmit,
  onClose,
  className,
}) => {
  const [fields, setFields] = useState(EMPTY)
  const [isSubmitted, setIsSubmitted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFields(EMPTY)
      setIsSubmitted(false)
    }
  }, [isOpen])

  const name = fields.name.trim()
  const quantity = Number(fields.quantity)
  // Пустая цена — тот же ноль: поле стёрли, а не ошиблись.
  const priceCents = fields.price.trim() === '' ? 0 : parsePrice(fields.price)

  const nameError = name === '' ? 'Укажите, что купить' : null
  const quantityError =
    fields.quantity === '' || quantity < 1 || quantity > MAX_QUANTITY
      ? `Количество от 1 до ${MAX_QUANTITY}`
      : null
  const priceError =
    priceCents === null
      ? 'Цена в сомах, например 1250 или 1250.50'
      : priceCents > MAX_PRICE_CENTS
        ? 'Цена не больше 20 000 000 сом'
        : null

  const handleSubmit = (): void => {
    setIsSubmitted(true)

    if (
      nameError !== null ||
      quantityError !== null ||
      priceCents === null ||
      priceError !== null
    ) {
      return
    }

    onSubmit({ name, quantity, unitPriceCents: priceCents })
  }

  return (
    <Modal
      className={clsx(styles.container, className)}
      isOpen={isOpen}
      onClose={onClose}
      title="Добавить пункт"
      size="sm"
      isDismissable={false}
      footer={
        <>
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            Отмена
          </Button>
          <Button isLoading={isBusy} onClick={handleSubmit}>
            Добавить
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <Input
          label="Наименование"
          value={fields.name}
          maxLength={NAME_MAX_LENGTH}
          required={true}
          disabled={isBusy}
          error={isSubmitted ? nameError : null}
          onChange={next => {
            setFields(current => ({ ...current, name: next }))
          }}
        />

        <div className={styles.numbers}>
          <Input
            label="Количество"
            value={fields.quantity}
            inputMode="numeric"
            maxLength={QUANTITY_MAX_LENGTH}
            required={true}
            disabled={isBusy}
            error={isSubmitted ? quantityError : null}
            onChange={next => {
              setFields(current => ({ ...current, quantity: digitsOnly(next) }))
            }}
          />

          <Input
            label="Цена за шт, сом"
            value={fields.price}
            inputMode="decimal"
            hint="Можно оставить 0"
            disabled={isBusy}
            error={isSubmitted ? priceError : null}
            onChange={next => {
              setFields(current => ({ ...current, price: priceOnly(next) }))
            }}
          />
        </div>

        {error !== null && (
          <Alert tone="danger" title="Не добавлено">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
