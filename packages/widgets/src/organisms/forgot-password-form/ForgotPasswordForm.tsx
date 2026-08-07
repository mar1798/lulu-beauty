import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IForgotPasswordFormProps } from '../../types'
import { validatePhone } from '../../utils'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { PhoneInput } from '../../atoms/phone-input'
import * as styles from './ForgotPasswordForm.css'

/**
 * Первый шаг восстановления пароля: только телефон. Код на смену пароля
 * приходит тем же каналом, что и вход/регистрация (Telegram), — второй шаг
 * (`ResetPasswordForm`) подтверждает его и задаёт новый пароль.
 */
export const ForgotPasswordForm: FC<IForgotPasswordFormProps & IBasicStyling> = ({
  onSubmit,
  isSubmitting = false,
  error,
  className,
}) => {
  const [phone, setPhone] = useState('')
  const [isTouched, setIsTouched] = useState(false)

  const phoneError = validatePhone(phone)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (phoneError !== null) {
      return
    }

    onSubmit({ phone })
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось отправить код">
          {error}
        </Alert>
      )}

      <PhoneInput
        label="Телефон"
        hint="Код для смены пароля придёт в Telegram"
        value={phone}
        onChange={setPhone}
        error={isTouched ? phoneError : null}
        disabled={isSubmitting}
        required={true}
      />

      <Button className={styles.submit} type="submit" isFullWidth={true} isLoading={isSubmitting}>
        Отправить код
      </Button>
    </form>
  )
}
