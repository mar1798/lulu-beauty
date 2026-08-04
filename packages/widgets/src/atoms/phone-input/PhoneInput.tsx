import { type FC } from 'react'
import type { IBasicStyling, IPhoneInputProps } from '../../types'
import { Input } from '../input'
import * as styles from './PhoneInput.css'

/**
 * Телефон в формате `+996 555 12 34 56`.
 *
 * Наружу (`onChange`) всегда уходит E.164 — `+996555123456`, — потому что
 * бэкенд проверяет ровно этот вид (`PHONE_PATTERN = ^\+[1-9]\d{7,14}$`,
 * `apps/api/app/common/phone.py`). Код страны показан статичным префиксом
 * и в значение поля не входит: так его нельзя случайно стереть бэкспейсом.
 */

/**
 * Длина национальной части кыргызстанского номера. `dialCode` можно подменить,
 * но длина остаётся девять цифр: поле рассчитано на местных покупателей,
 * а полноценный международный ввод потребовал бы таблицы форматов по странам.
 */
const NATIONAL_LENGTH = 9

/** Группировка национальной части: `555 12 34 56`. */
const GROUPS = [3, 2, 2, 2]

const DEFAULT_DIAL_CODE = '996'

export const digitsOnly = (raw: string): string => raw.replace(/\D/g, '')

/**
 * Национальная часть из чего угодно: `0555123456`, `996555123456`,
 * `+996 555 12 34 56` и просто `555123456` дают один и тот же результат.
 */
export const toNationalDigits = (raw: string, dialCode: string = DEFAULT_DIAL_CODE): string => {
  let digits = digitsOnly(raw)

  if (digits.startsWith(dialCode)) {
    digits = digits.slice(dialCode.length)
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  return digits.slice(0, NATIONAL_LENGTH)
}

export const formatNational = (digits: string): string => {
  const parts: string[] = []
  let rest = digits

  for (const length of GROUPS) {
    if (rest === '') {
      break
    }

    parts.push(rest.slice(0, length))
    rest = rest.slice(length)
  }

  return parts.join(' ')
}

/** Пустая строка вместо голого `+996`, чтобы форма видела «поле не заполнено». */
export const toE164 = (raw: string, dialCode: string = DEFAULT_DIAL_CODE): string => {
  const national = toNationalDigits(raw, dialCode)

  return national === '' ? '' : `+${dialCode}${national}`
}

export const PhoneInput: FC<IPhoneInputProps & IBasicStyling> = ({
  value,
  onChange,
  dialCode = DEFAULT_DIAL_CODE,
  ...rest
}) => (
  <Input
    {...rest}
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    placeholder="555 12 34 56"
    prefix={<span className={styles.dialCode}>{`+${dialCode}`}</span>}
    value={formatNational(toNationalDigits(value, dialCode))}
    onChange={next => onChange(toE164(next, dialCode))}
  />
)
