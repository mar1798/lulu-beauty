import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStatusSelectProps, ISelectOption, OrderStatus } from '../../types'
import { Select } from '../../atoms/select'
import { orderStatusLabel } from '../order-status-badge'
import * as styles from './StatusSelect.css'

/**
 * Смена статуса заявки владельцем.
 *
 * Список статусов полный и без ограничений на переходы: state-machine на
 * бэкенде нет (пробел №8 плана), из «Выдана» можно вернуться в «Ожидает».
 * Придумывать правила на фронте нельзя — бэкенд их не проверяет, и запрет
 * оказался бы только видимостью.
 *
 * Подписи берутся из `orderStatusLabel`, то есть ровно те же, что в бейдже
 * заявки у покупателя.
 */

const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']

const OPTIONS: ISelectOption[] = STATUSES.map(status => ({
  value: status,
  label: orderStatusLabel(status),
}))

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
    options={OPTIONS}
    label={isLabelHidden ? undefined : label}
    // Скрытая подпись не исчезает совсем — она уходит в `aria-label` поля.
    ariaLabel={isLabelHidden ? label : undefined}
    disabled={disabled}
    onChange={next => {
      onChange(next as OrderStatus)
    }}
  />
)
