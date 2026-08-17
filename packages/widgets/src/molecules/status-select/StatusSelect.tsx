import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStatusSelectProps, ISelectOption, OrderStatus } from '../../types'
import { Select } from '../../atoms/select'
import { ASSIGNABLE_ORDER_STATUSES, orderStatusLabel } from '../order-status-badge'
import * as styles from './StatusSelect.css'

/**
 * Смена статуса заявки владельцем.
 *
 * Переходы почти не ограничены: state-machine на бэкенде нет (пробел №8 плана),
 * из «Выдана» можно вернуться в «Ожидает». Придумывать правила на фронте нельзя —
 * бэкенд их не проверяет, и запрет оказался бы только видимостью.
 *
 * Единственное исключение — «Отменена покупателем»: её бэкенд владельцу ставить
 * не даёт (`order_status_not_assignable`), потому что это утверждение о чужом
 * действии. В списке её поэтому нет — но у заявки, которую покупатель уже
 * отменил, она остаётся текущим значением, и без своего пункта поле показало бы
 * пустоту вместо статуса.
 *
 * Подписи берутся из `orderStatusLabel`, то есть ровно те же, что в бейдже
 * заявки у покупателя.
 */

const option = (status: OrderStatus): ISelectOption => ({
  value: status,
  label: orderStatusLabel(status),
})

const ASSIGNABLE: ISelectOption[] = ASSIGNABLE_ORDER_STATUSES.map(option)

const optionsFor = (value: OrderStatus): ISelectOption[] =>
  ASSIGNABLE_ORDER_STATUSES.includes(value) ? ASSIGNABLE : [option(value), ...ASSIGNABLE]

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
