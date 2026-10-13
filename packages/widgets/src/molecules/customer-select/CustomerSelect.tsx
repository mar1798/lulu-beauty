import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import type { IBasicStyling, ICustomerSelectProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { SearchField } from '../search-field'
import * as styles from './CustomerSelect.css'

/**
 * Выбор покупателя по имени или телефону — для заявки, которую админ
 * оформляет за него.
 *
 * Список встроен под поле, а не всплывает поверх: выбор живёт в окне рядом с
 * `ProductPicker`, и два поиска в одном окне должны вести себя одинаково. Ищет
 * бэкенд, дебаунс — забота страницы, как у подборщика товаров.
 *
 * В строке всегда и имя, и телефон: имена берутся из Telegram и совпадают
 * чаще, чем кажется, а различает людей номер.
 *
 * Выбранный покупатель встаёт на место поиска карточкой с «Изменить» — так
 * видно, для кого заявка, и не остаётся поля, которое можно случайно
 * перепечатать.
 */

/** Строк в скелетоне — как у `ProductPicker`. */
const SKELETON_ROWS = 3

/** Метка «нет в боте»: уведомление о заявке такому покупателю не уйдёт. */
const NOT_IN_BOT = 'Не в боте'

export const CustomerSelect: FC<ICustomerSelectProps & IBasicStyling> = ({
  value,
  onChange,
  query,
  onQueryChange,
  results,
  isSearching = false,
  error = null,
  label = 'Покупатель',
  disabled = false,
  className,
}) => {
  if (value !== null) {
    return (
      <div className={clsx(styles.container, className)}>
        <Text size="sm" weight="medium">
          {label}
        </Text>

        <div className={styles.selected}>
          <div className={styles.person}>
            <Text weight="medium" clamp={1}>
              {value.name}
            </Text>
            <div className={styles.meta}>
              <Text size="sm" tone="muted">
                {value.phone}
              </Text>
              {!value.telegramLinked && <Badge tone="warning">{NOT_IN_BOT}</Badge>}
            </div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              onChange(null)
            }}
          >
            Изменить
          </Button>
        </div>
      </div>
    )
  }

  const hasQuery = query.trim() !== ''

  const list = (): ReactNode => {
    // Сбой поиска — не пустой ответ: «никого нет» там, где запрос не дошёл, было бы неправдой.
    if (error !== null) {
      return (
        <Text size="sm" tone="danger">
          {error}
        </Text>
      )
    }

    if (!hasQuery) {
      return (
        <Text size="sm" tone="muted">
          Начните вводить имя или номер телефона
        </Text>
      )
    }

    if (isSearching) {
      return (
        <div className={styles.list} aria-busy={true}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.skeletonRow}>
              <Skeleton width="45%" tone="brand" />
              <Skeleton width="30%" height={16} tone="brand" />
            </div>
          ))}
        </div>
      )
    }

    if (results === null) {
      return null
    }

    if (results.length === 0) {
      return (
        <Text size="sm" tone="muted">
          Никого не нашлось. Покупатель появляется здесь, когда поделится номером с ботом.
        </Text>
      )
    }

    return (
      <ul className={styles.list}>
        {results.map(customer => (
          <li key={customer.id} className={styles.item}>
            <button
              type="button"
              className={styles.option}
              disabled={disabled}
              onClick={() => {
                onChange(customer)
              }}
            >
              <span className={styles.person}>
                <Text as="span" size="sm" weight="medium" clamp={1}>
                  {customer.name}
                </Text>
                <Text as="span" size="sm" tone="muted">
                  {customer.phone}
                </Text>
              </span>
              {!customer.telegramLinked && <Badge tone="warning">{NOT_IN_BOT}</Badge>}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      <SearchField
        value={query}
        onChange={onQueryChange}
        label={label}
        placeholder="Имя или телефон"
        isBusy={isSearching}
      />

      {list()}
    </div>
  )
}
