import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IRegisterFormProps } from '../../types'
import { validateName, validatePassword, validatePhone } from '../../utils'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { PasswordInput } from '../../atoms/password-input'
import { PhoneInput } from '../../atoms/phone-input'
import * as styles from './RegisterForm.css'

/**
 * Регистрация: телефон, имя, пароль.
 *
 * Телефон здесь — не просто логин: на него же приходит код в Telegram, а
 * владелец по нему связывается с покупателем. Поэтому подсказка про Telegram
 * стоит прямо у поля, а не только на следующем экране.
 */
export const RegisterForm: FC<IRegisterFormProps & IBasicStyling> = ({
  onSubmit,
  isSubmitting = false,
  error,
  className,
}) => {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isTouched, setIsTouched] = useState(false)

  const phoneError = validatePhone(phone)
  const nameError = validateName(name)
  const passwordError = validatePassword(password)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (phoneError !== null || nameError !== null || passwordError !== null) {
      return
    }

    onSubmit({ phone, name, password })
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось зарегистрироваться">
          {error}
        </Alert>
      )}

      <PhoneInput
        label="Телефон"
        hint="На этот номер придёт код в Telegram"
        value={phone}
        onChange={setPhone}
        error={isTouched ? phoneError : null}
        disabled={isSubmitting}
        required={true}
      />

      <Input
        label="Имя"
        placeholder="Как к вам обращаться"
        autoComplete="name"
        value={name}
        onChange={setName}
        error={isTouched ? nameError : null}
        disabled={isSubmitting}
        required={true}
      />

      <PasswordInput
        label="Пароль"
        hint="Не короче 8 символов"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={isTouched ? passwordError : null}
        disabled={isSubmitting}
        required={true}
      />

      <Button className={styles.submit} type="submit" isFullWidth={true} isLoading={isSubmitting}>
        Зарегистрироваться
      </Button>
    </form>
  )
}
