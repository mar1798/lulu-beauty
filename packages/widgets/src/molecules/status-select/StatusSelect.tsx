import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStatusSelectProps, ISelectOption, OrderStatus } from '../../types'
import { Select } from '../../atoms/select'
import { ORDER_STATUS_TRANSITIONS, orderStatusLabel } from '../order-status-badge'
import * as styles from './StatusSelect.css'

/**
 * Смена статуса заявки владельцем.
 *
 * В списке — только те статусы, куда из текущего действительно можно перейти
 * (`ORDER_STATUS_TRANSITIONS`, зеркало таблицы на бэкенде). Раньше здесь стояли
 * все статусы разом, потому что бэкенд ничего не проверял и запрет на фронте был
 * бы только видимостью; теперь он проверяет, и показывать недостижимое значит
 * предлагать ошибку — тем более что нажатие «Подтверждена» на отменённой заявке
 * отправляло покупателю уведомление о заявке, которую тот отозвал.
 *
 * Текущее значение всегда первое в списке — иначе поле показало бы пустоту
 * вместо статуса, а у терминальной заявки (выдана, отменена) оно единственное:
 * менять там нечего, и поле остаётся подписью.
 *
 * Подписи берутся из `orderStatusLabel`, то есть ровно те же, что в бейдже
 * заявки у покупателя.
 */

const option = (status: OrderStatus): ISelectOption => ({
  value: status,
  label: orderStatusLabel(status),
})

const optionsFor = (value: OrderStatus): ISelectOption[] =>
  [value, ...ORDER_STATUS_TRANSITIONS[value]].map(option)

export const StatusSelect: FC<IStatusSelectProps & IBasicStyling> = ({
  value,
  onChange,
  label = 'Статус заявки',
  isLabelHidden = false,
  disabled = false,
  className,
}) => (
  <Select
    className={clsx(styles.container, className)}
    value={value}
    options={optionsFor(value)}
    label={isLabelHidden ? undefined : label}
    // Скрытая подпись не исчезает совсем — она уходит в `aria-label` поля.
    ariaLabel={isLabelHidden ? label : undefined}
    disabled={disabled}
    onChange={next => {
      onChange(next as OrderStatus)
    }}
  />
)
