import clsx from 'clsx'
import { type FC, type FormEvent } from 'react'
import type { IBasicStyling, IPromoCodeFieldProps } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { formatPrice } from '../../atoms/price'
import { Text } from '../../atoms/text'
import * as styles from './PromoCodeField.css'

/**
 * Поле промокода на оформлении и в поданной заявке: ввод, проверка и выбор из своих кодов.
 *
 * Проверку делает сервер (на оформлении `POST /cart/promo-code/check`, в заявке код
 * применяется сразу), поле только держит её исходы. Принятый код заменяет ввод своей
 * строкой - с тем, что он даёт, и кнопкой «Убрать»: человек видит, что код действует,
 * и может от него отказаться, пока заявку можно менять.
 *
 * Это не вложенная форма: поле живёт и внутри формы оформления, а `<form>` в
 * `<form>` недопустим, поэтому «Применить» - обычная кнопка, а Enter в поле
 * перехватывается и применяет код вместо отправки заявки.
 */
export const PromoCodeField: FC<IPromoCodeFieldProps & IBasicStyling> = ({
  value,
  onChange,
  onApply,
  applied,
  onRemove,
  isChecking = false,
  error = null,
  options = [],
  onPickOption,
  allCodesHref,
  disabled = false,
  className,
}) => {
  if (applied !== null) {
    return (
      <div className={clsx(styles.container, className)}>
        <div className={styles.appliedBox} role="status">
          <div className={styles.appliedText}>
            <Text weight="medium" as="span">
              {`Промокод ${applied.code}`}
            </Text>

            <Text size="sm" tone="secondary" as="span">
              {applied.description}
            </Text>

            {applied.discountCents > 0 && (
              <Text size="sm" weight="medium" tone="success" as="span">
                {`Скидка: -${formatPrice(applied.discountCents)}`}
              </Text>
            )}
          </div>

          <Button variant="ghost" size="md" disabled={disabled} onClick={onRemove}>
            Убрать
          </Button>
        </div>
      </div>
    )
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    onApply()
  }

  return (
    <div className={clsx(styles.container, className)}>
      <Text weight="medium" as="span">
        Промокод
      </Text>

      <div className={styles.inputRow}>
        <Input
          ariaLabel="Промокод"
          value={value}
          onChange={onChange}
          placeholder="Например, AB12CD34"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={64}
          disabled={disabled || isChecking}
          error={error}
          className={styles.input}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              handleSubmit(event)
            }
          }}
        />

        <Button
          variant="primary"
          size="md"
          className={styles.apply}
          isLoading={isChecking}
          disabled={disabled || value.trim() === ''}
          onClick={onApply}
        >
          Применить
        </Button>
      </div>

      {options.length > 0 && (
        <div className={styles.options}>
          <Text size="sm" tone="muted">
            Ваши промокоды
          </Text>

          <ul className={styles.optionList}>
            {options.map(option => (
              <li key={option.code}>
                <button
                  type="button"
                  className={styles.option}
                  disabled={disabled || isChecking}
                  onClick={() => onPickOption?.(option.code)}
                >
                  <span className={styles.optionCode}>{option.code}</span>
                  <span className={styles.optionLabel}>{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allCodesHref !== undefined && (
        <AppLink href={allCodesHref} className={styles.allCodes}>
          Все мои промокоды
        </AppLink>
      )}
    </div>
  )
}
