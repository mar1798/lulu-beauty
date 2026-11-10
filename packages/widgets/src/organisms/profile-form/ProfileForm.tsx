import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IProfileFormProps, IProfileValues } from '../../types'
import {
  DELIVERY_TEXT_MAX_LENGTH,
  NAME_MAX_LENGTH,
  multiLine,
  singleLine,
  validateName,
} from '../../utils'
import { FIELD_HEIGHT } from '../../styling/mixin'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { PhoneInput } from '../../atoms/phone-input'
import { Skeleton } from '../../atoms/skeleton'
import { Textarea } from '../../atoms/textarea'
import * as styles from './ProfileForm.css'

/**
 * Профиль: имя и доставка правятся, телефон — нет.
 *
 * Телефон одновременно логин и адрес доставки кода, менять его без повторного
 * подтверждения нельзя, и `PATCH /users/me` его вовсе не принимает. Поле
 * оставлено видимым и заблокированным: спрятать номер значило бы заставить
 * человека гадать, на какой из своих номеров он зарегистрирован.
 *
 * Адрес доставки и комментарий к получению необязательны и пишутся свободным
 * текстом: доставку владелец всё равно обговаривает лично, а разбивка на
 * город, улицу и квартиру дала бы только больше пустых полей. Владелец видит
 * их в раскрытой заявке в админке. Самовывоз или отправка в другой город —
 * тоже в комментарий, отдельного выбора способа нет.
 *
 * Начальные значения полей берутся из пропса один раз, при монтировании:
 * форма — владелец введённого текста, и внешнее обновление профиля не должно
 * затирать недописанное. Смена аккаунта решается `key` на стороне страницы.
 */

/** Высота скелетона поля: подпись, зазор и сам контроль в `FIELD_HEIGHT`. */
const LABEL_BLOCK_HEIGHT = 26
const FIELD_SKELETON_HEIGHT = FIELD_HEIGHT + LABEL_BLOCK_HEIGHT
/** Строки полей доставки: адрес бывает в несколько строк, комментарий короче. */
const ADDRESS_ROWS = 3
const NOTE_ROWS = 2
/** Строка текста в поле, его внутренние отступы с рамкой и подсказка со счётчиком под ним. */
const TEXTAREA_LINE_HEIGHT = 24
const TEXTAREA_CHROME_HEIGHT = 26
const TEXTAREA_FOOTER_HEIGHT = 24
const textareaSkeletonHeight = (rows: number): number =>
  LABEL_BLOCK_HEIGHT + rows * TEXTAREA_LINE_HEIGHT + TEXTAREA_CHROME_HEIGHT + TEXTAREA_FOOTER_HEIGHT
export const ProfileForm: FC<IProfileFormProps & IBasicStyling> = ({
  user,
  isLoading = false,
  onSubmit,
  isSubmitting = false,
  error,
  isSaved = false,
  footer,
  className,
}) => {
  const [name, setName] = useState(user?.name ?? '')
  const [deliveryAddress, setDeliveryAddress] = useState(user?.deliveryAddress ?? '')
  const [deliveryNote, setDeliveryNote] = useState(user?.deliveryNote ?? '')
  const [isTouched, setIsTouched] = useState(false)

  const nameError = validateName(name)
  /*
    Значения чистятся так же, как их почистит бэкенд (`utils/text.ts`): сравниваем
    и отправляем ровно то, что сохранится. С одним `trim()` пробел перед переносом
    или пустая строка в адресе оставляли форму «изменённой» и после сохранения —
    сервер возвращал очищенный текст, а в поле оставался исходный. Незаполненное
    поле профиля (`null`) равно пустой строке.
  */
  const values: IProfileValues = {
    name: singleLine(name),
    deliveryAddress: multiLine(deliveryAddress),
    deliveryNote: multiLine(deliveryNote),
  }
  const isDirty =
    user !== null &&
    (values.name !== user.name ||
      values.deliveryAddress !== (user.deliveryAddress ?? '') ||
      values.deliveryNote !== (user.deliveryNote ?? ''))

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setIsTouched(true)

    if (nameError !== null) {
      return
    }

    // В полях остаётся очищенный текст — тот, что сохранится и вернётся с сервера.
    setName(values.name)
    setDeliveryAddress(values.deliveryAddress)
    setDeliveryNote(values.deliveryNote)
    onSubmit(values)
  }

  /*
    Скелетон — «строки полей» ровно той высоты, что и настоящие: иначе
    после ответа блок подрастает и уводит вниз всё, что стоит под формой.
  */
  if (isLoading) {
    return (
      <div className={clsx(styles.form, className)} aria-busy={true}>
        <Skeleton shape="block" width="100%" height={FIELD_SKELETON_HEIGHT} />
        <Skeleton shape="block" width="100%" height={FIELD_SKELETON_HEIGHT} />
        <Skeleton shape="block" width="100%" height={textareaSkeletonHeight(ADDRESS_ROWS)} />
        <Skeleton shape="block" width="100%" height={textareaSkeletonHeight(NOTE_ROWS)} />
        <Skeleton shape="block" width={140} height={44} />
      </div>
    )
  }

  if (user === null) {
    return null
  }

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit} noValidate={true}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не удалось сохранить">
          {error}
        </Alert>
      )}

      {/* Пока поля снова не тронули, подтверждение сохранения остаётся на виду. */}
      {isSaved && !isDirty && <Alert tone="success">Изменения сохранены.</Alert>}

      <Input
        label="Имя"
        autoComplete="name"
        value={name}
        maxLength={NAME_MAX_LENGTH}
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
        hint="Номер менять нельзя: по нему аккаунт связан с Telegram"
        value={user.phone}
        onChange={() => undefined}
        readOnly={true}
      />

      <Textarea
        label="Адрес доставки"
        hint="Необязательно: город, улица, дом, квартира или ориентир"
        autoComplete="street-address"
        value={deliveryAddress}
        rows={ADDRESS_ROWS}
        maxLength={DELIVERY_TEXT_MAX_LENGTH}
        onChange={setDeliveryAddress}
        disabled={isSubmitting}
      />

      <Textarea
        label="Как удобнее получить"
        hint="Необязательно: самовывоз, доставка по городу или в другой город, удобное время"
        value={deliveryNote}
        rows={NOTE_ROWS}
        maxLength={DELIVERY_TEXT_MAX_LENGTH}
        onChange={setDeliveryNote}
        disabled={isSubmitting}
      />

      <Button className={styles.submit} type="submit" isLoading={isSubmitting} disabled={!isDirty}>
        Сохранить
      </Button>

      {footer !== undefined && <div className={styles.footer}>{footer}</div>}
    </form>
  )
}
