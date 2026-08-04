import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IOtpVerifyFormProps } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { OtpInput } from '../../atoms/otp-input'
import { Text } from '../../atoms/text'
import * as styles from './OtpVerifyForm.css'

/**
 * Ввод кода из Telegram.
 *
 * Код отправляется автоматически, как только набраны все шесть цифр:
 * заставлять жать «Подтвердить» после вставки кода из уведомления — лишний
 * шаг. Кнопка при этом остаётся: без неё непонятно, что делать, если
 * автоотправка не сработала.
 */

const CODE_LENGTH = 6

export const OtpVerifyForm: FC<IOtpVerifyFormProps & IBasicStyling> = ({
  onSubmit,
  isSubmitting = false,
  error,
  hint,
  resendAction,
  className,
}) => {
  const [code, setCode] = useState('')

  const submit = (value: string): void => {
    if (value.length === CODE_LENGTH && !isSubmitting) {
      onSubmit(value)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    submit(code)
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Код не подошёл">
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
        onComplete={submit}
        length={CODE_LENGTH}
        disabled={isSubmitting}
        autoFocus={true}
      />

      <Button
        className={styles.submit}
        type="submit"
        isFullWidth={true}
        isLoading={isSubmitting}
        disabled={code.length !== CODE_LENGTH}
      >
        Подтвердить
      </Button>

      {resendAction !== undefined && <div className={styles.resend}>{resendAction}</div>}
    </form>
  )
}
