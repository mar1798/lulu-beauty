import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IProfileFormProps } from '../../types'
import { validateName } from '../../utils'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { PhoneInput } from '../../atoms/phone-input'
import * as styles from './ProfileForm.css'

/**
 * Профиль: имя правится, телефон — нет.
 *
 * Телефон одновременно логин и адрес доставки кода, менять его без повторного
 * подтверждения нельзя, и `PATCH /users/me` его вовсе не принимает. Поле
 * оставлено видимым и заблокированным: спрятать номер значило бы заставить
 * человека гадать, на какой из своих номеров он зарегистрирован.
 *
 * Начальное значение имени берётся из пропса один раз, при монтировании:
 * форма — владелец введённого текста, и внешнее обновление профиля не должно
 * затирать недописанное. Смена аккаунта решается `key` на стороне страницы.
 */
export const ProfileForm: FC<IProfileFormProps & IBasicStyling> = ({
  user,
  onSubmit,
  isSubmitting = false,
  error,
  isSaved = false,
  footer,
  className,
}) => {
  const [name, setName] = useState(user.name)
  const [isTouched, setIsTouched] = useState(false)

  const nameError = validateName(name)
  const isDirty = name.trim() !== user.name

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (nameError !== null) {
      return
    }

    onSubmit(name.trim())
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось сохранить">
          {error}
        </Alert>
      )}

      {/* Пока имя снова не тронули, подтверждение сохранения остаётся на виду. */}
      {isSaved && !isDirty && <Alert tone="success">Изменения сохранены.</Alert>}

      <Input
        label="Имя"
        autoComplete="name"
        value={name}
        onChange={setName}
        error={isTouched ? nameError : null}
        disabled={isSubmitting}
        required={true}
      />

      {/*
        `readOnly`, а не `disabled`: заблокированное поле выпадает из обхода
        с клавиатуры, и свой же номер стало бы не прочитать скринридером.
      */}
      <PhoneInput
        label="Телефон"
        hint="Номер менять нельзя: по нему приходит код подтверждения"
        value={user.phone}
        onChange={() => undefined}
        readOnly={true}
      />

      <Button
        className={styles.submit}
        type="submit"
        isLoading={isSubmitting}
        disabled={!isDirty}
      >
        Сохранить
      </Button>

      {footer !== undefined && <div className={styles.footer}>{footer}</div>}
    </form>
  )
}
