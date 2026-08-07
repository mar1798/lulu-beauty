import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IResetPasswordFormProps } from '../../types'
import { validatePassword } from '../../utils'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { OtpInput } from '../../atoms/otp-input'
import { PasswordInput } from '../../atoms/password-input'
import { Text } from '../../atoms/text'
import * as styles from './ResetPasswordForm.css'

/**
 * Второй и последний шаг восстановления пароля: код из Telegram и новый
 * пароль — одной формой, а не двумя экранами. В отличие от `OtpVerifyForm`
 * код не отправляется автоматически по вводу шестой цифры: пароль к этому
 * моменту обычно ещё не набран, а отдельной ручки «код без пароля» бэкенд
 * не даёт — `POST /auth/reset-password` проверяет и то, и другое разом.
 */

const CODE_LENGTH = 6

export const ResetPasswordForm: FC<IResetPasswordFormProps & IBasicStyling> = ({
  onSubmit,
  isSubmitting = false,
  error,
  hint,
  resendAction,
  className,
}) => {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [isTouched, setIsTouched] = useState(false)

  const passwordError = validatePassword(password)
  const isCodeComplete = code.length === CODE_LENGTH

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (!isCodeComplete || passwordError !== null) {
      return
    }

    onSubmit({ code, password })
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось сменить пароль">
          {error}
        </Alert>
      )}

      {hint !== undefined && (
        <Text size="sm" tone="secondary">
          {hint}
        </Text>
      )}

      <OtpInput
        label="Код из Telegram"
        value={code}
        onChange={setCode}
        length={CODE_LENGTH}
        disabled={isSubmitting}
        autoFocus={true}
      />

      <PasswordInput
        label="Новый пароль"
        hint="Не короче 8 символов"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={isTouched ? passwordError : null}
        disabled={isSubmitting}
        required={true}
      />

      <Button
        className={styles.submit}
        type="submit"
        isFullWidth={true}
        isLoading={isSubmitting}
        disabled={!isCodeComplete}
      >
        Сохранить пароль
      </Button>

      {resendAction !== undefined && <div className={styles.resend}>{resendAction}</div>}
    </form>
  )
}
