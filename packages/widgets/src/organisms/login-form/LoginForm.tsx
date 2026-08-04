import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, ILoginFormProps } from '../../types'
import { validatePassword, validatePhone } from '../../utils'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { PasswordInput } from '../../atoms/password-input'
import { PhoneInput } from '../../atoms/phone-input'
import * as styles from './LoginForm.css'

/**
 * Вход по телефону и паролю. Токенов не выдаёт: бэкенд в ответ шлёт код
 * в Telegram, и настоящий вход происходит на следующем шаге.
 *
 * Ошибки полей показываются только после первой попытки отправки —
 * подсвечивать «введите пароль» человеку, который ещё печатает имя,
 * бессмысленно и раздражает.
 */
export const LoginForm: FC<ILoginFormProps & IBasicStyling> = ({
  onSubmit,
  isSubmitting = false,
  error,
  className,
}) => {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isTouched, setIsTouched] = useState(false)

  const phoneError = validatePhone(phone)
  const passwordError = validatePassword(password)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (phoneError !== null || passwordError !== null) {
      return
    }

    onSubmit({ phone, password })
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось войти">
          {error}
        </Alert>
      )}

      <PhoneInput
        label="Телефон"
        value={phone}
        onChange={setPhone}
        error={isTouched ? phoneError : null}
        disabled={isSubmitting}
        required={true}
      />

      <PasswordInput
        label="Пароль"
        value={password}
        onChange={setPassword}
        error={isTouched ? passwordError : null}
        disabled={isSubmitting}
        required={true}
      />

      <Button className={styles.submit} type="submit" isFullWidth={true} isLoading={isSubmitting}>
        Войти
      </Button>
    </form>
  )
}
