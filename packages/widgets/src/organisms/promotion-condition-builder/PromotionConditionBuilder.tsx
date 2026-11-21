import clsx from 'clsx'
import { type FC } from 'react'
import type {
  IBasicStyling,
  IPromotionConditionBuilderProps,
  IPromotionConditionDraft,
  ISelectOption,
  PromotionConditionType,
} from '../../types'
import { IconPlus, IconTrash } from '../../svg/icons'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Switch } from '../../atoms/switch'
import { Text } from '../../atoms/text'
import { priceOnly } from '../../utils/priceInput'
import { MAX_PROMOTION_CONDITIONS, newConditionDraft } from '../../utils/promotion'
import { PromotionTargetField } from '../promotion-target-field'
import * as styles from './PromotionConditionBuilder.css'

/**
 * Условия акции: список строк «тип → поля», все через **И**.
 *
 * Три вида: сумма покупки, количество товаров, наличие конкретных товаров. У
 * суммы и количества выбор «что учитывается» необязателен — без него считается
 * вся корзина; у «содержит» цель обязательна, иначе условие ничего не проверяет.
 *
 * Числа здесь — строки (черновик), в тело запроса их переводит
 * `buildConditions`; ошибка конкретной строки приходит в `errors` по её `key`
 * и стоит прямо в ней.
 *
 * Пустой список — акция без условий: награда достаётся любой заявке. Об этом
 * сказано под списком, чтобы пустота не читалась как «забыли заполнить».
 */

const TYPE_OPTIONS: ISelectOption[] = [
  { value: 'SUBTOTAL', label: 'Сумма покупки' },
  { value: 'QUANTITY', label: 'Количество товаров' },
  { value: 'CONTAINS', label: 'Покупка конкретных товаров' },
]

const MODE_OPTIONS: ISelectOption[] = [
  { value: 'ANY', label: 'Любой из выбранных' },
  { value: 'ALL', label: 'Все выбранные' },
]

const QUANTITY_MAX_LENGTH = 5

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

export const PromotionConditionBuilder: FC<IPromotionConditionBuilderProps & IBasicStyling> = ({
  value,
  onChange,
  catalog,
  errors = {},
  maxRows = MAX_PROMOTION_CONDITIONS,
  className,
}) => {
  const update = (key: string, patch: Partial<IPromotionConditionDraft>): void => {
    onChange(value.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  const changeType = (row: IPromotionConditionDraft, type: PromotionConditionType): void => {
    update(row.key, { type, hasTarget: type === 'CONTAINS' ? true : row.hasTarget })
  }

  return (
    <div className={clsx(styles.container, className)}>
      {value.length === 0 && (
        <Text size="sm" tone="muted">
          Условий нет - награда достанется любой заявке.
        </Text>
      )}

      {value.map((row, index) => {
        const error = errors[row.key]
        const hasOptionalTarget = row.type !== 'CONTAINS'

        return (
          <div
            key={row.key}
            className={styles.row}
            role="group"
            aria-label={`Условие ${index + 1}`}
          >
            <div className={styles.rowHead}>
              <span className={styles.rowTitle}>Условие {index + 1}</span>

              <IconButton
                icon={<IconTrash />}
                label={`Удалить условие ${index + 1}`}
                size="md"
                variant="danger"
                onClick={() => {
                  onChange(value.filter(item => item.key !== row.key))
                }}
              />
            </div>

            <div className={styles.fields}>
              <Select
                label="Тип"
                value={row.type}
                options={TYPE_OPTIONS}
                onChange={next => {
                  changeType(row, next as PromotionConditionType)
                }}
              />

              {row.type === 'SUBTOTAL' && (
                <Input
                  label="От суммы, сом"
                  value={row.amount}
                  inputMode="decimal"
                  placeholder="2000"
                  required={true}
                  error={error ?? null}
                  onChange={next => {
                    update(row.key, { amount: priceOnly(next) })
                  }}
                />
              )}

              {row.type === 'QUANTITY' && (
                <Input
                  label="От количества, шт"
                  value={row.quantity}
                  inputMode="numeric"
                  maxLength={QUANTITY_MAX_LENGTH}
                  placeholder="3"
                  required={true}
                  error={error ?? null}
                  onChange={next => {
                    update(row.key, { quantity: digitsOnly(next) })
                  }}
                />
              )}

              {row.type === 'CONTAINS' && (
                <Select
                  label="Сколько из выбранных"
                  value={row.mode}
                  options={MODE_OPTIONS}
                  onChange={next => {
                    update(row.key, { mode: next === 'ALL' ? 'ALL' : 'ANY' })
                  }}
                />
              )}
            </div>

            {hasOptionalTarget && (
              <Switch
                label="Считать только выбранные товары"
                checked={row.hasTarget}
                onChange={next => {
                  update(row.key, { hasTarget: next })
                }}
              />
            )}

            {row.hasTarget && (
              <PromotionTargetField
                legend={hasOptionalTarget ? 'Что считается' : 'Какие товары нужны'}
                value={row.target}
                catalog={catalog}
                onChange={target => {
                  update(row.key, { target })
                }}
              />
            )}

            {row.type === 'CONTAINS' && error !== undefined && (
              <Text size="sm" tone="danger">
                {error}
              </Text>
            )}
          </div>
        )
      })}

      <Button
        variant="secondary"
        isFullWidth="mobile"
        iconStart={<IconPlus />}
        disabled={value.length >= maxRows}
        onClick={() => {
          onChange([...value, newConditionDraft()])
        }}
      >
        Добавить условие
      </Button>
    </div>
  )
}
