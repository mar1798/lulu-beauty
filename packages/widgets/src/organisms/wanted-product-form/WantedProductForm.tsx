import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IWantedProductFormProps, IWantedProductValues } from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import { Input } from '../../atoms/input'
import { PhoneInput } from '../../atoms/phone-input'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import { validateName, validatePhone } from '../../utils/validation'
import * as styles from './WantedProductForm.css'

/**
 * «Не нашли? Расскажите, что искали» — пожелание к следующему сбору.
 *
 * Стоит там, где поиск ничем не помог: под пустой выдачей в шапке и под
 * короткой выборкой каталога. Смысл у блока ровно один — не отпускать человека
 * с пустой страницы, поэтому он не спрашивает ничего, кроме текста: имя и номер
 * появляются только у гостя, которому иначе нечем ответить.
 *
 * Сбор здесь ни при чём, и это намеренно: пожелание тем и ценно, что его пишут
 * между сборами, когда добавить товар ещё можно.
 *
 * Презентационный, как всё в `widgets`: отправляет наружу (`onSubmit`) и ничего
 * не знает ни про ручку, ни про то, вошёл ли покупатель, — про это ему говорят
 * пропом.
 */

/** Столько принимает бэкенд (`MAX_WANTED_MESSAGE_LENGTH`), и `Textarea` считает остаток. */
const MESSAGE_MAX_LENGTH = 1000

const DEFAULT_TITLE = 'Похоже, ничего не удалось найти'

const MESSAGE_LABEL = 'Что вы искали'

const DEFAULT_DESCRIPTION =
  'Расскажите, что вы ищете, - постараемся добавить этот товар в следующий сбор'

interface IFieldErrors {
  name?: string
  phone?: string
  message?: string
}

export const WantedProductForm: FC<IWantedProductFormProps & IBasicStyling> = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  isSignedIn = false,
  onSubmit,
  isSubmitting = false,
  error,
  isSent = false,
  isCompact = false,
  className,
}) => {
  const [values, setValues] = useState<IWantedProductValues>({ name: '', phone: '', message: '' })
  const [errors, setErrors] = useState<IFieldErrors>({})

  const change = (field: keyof IWantedProductValues, next: string): void => {
    setValues(current => ({ ...current, [field]: next }))
    /* Правка поля снимает его же ошибку: висящая подпись под уже исправленной
       строкой читается как вторая претензия, а не как прошлая. */
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    /*
      Имя и телефон проверяются только у гостя: у вошедшего их здесь и нет —
      бэкенд берёт контакт с аккаунта, а не из формы (`WantedProductsService`).
    */
    const found: IFieldErrors = {
      message: values.message.trim() === '' ? 'Напишите, что вы ищете' : undefined,
      name: isSignedIn ? undefined : (validateName(values.name) ?? undefined),
      phone: isSignedIn ? undefined : (validatePhone(values.phone) ?? undefined),
    }

    if (found.message !== undefined || found.name !== undefined || found.phone !== undefined) {
      setErrors(found)
      return
    }

    setErrors({})
    onSubmit({
      name: values.name.trim(),
      phone: values.phone,
      message: values.message.trim(),
    })
  }

  /*
    Отправленная форма уходит целиком, а не блокируется: возвращаться в неё
    незачем, а оставленные поля выглядят как «отправьте ещё раз».
  */
  if (isSent) {
    return (
      <div className={clsx(styles.container, isCompact && styles.compact, className)}>
        <Text weight="medium">Спасибо, записали</Text>
        <Text size="sm" tone="secondary">
          Посмотрим, получится ли привезти это в следующий сбор.
        </Text>
      </div>
    )
  }

  return (
    <form
      className={clsx(styles.container, isCompact && styles.compact, className)}
      onSubmit={handleSubmit}
      noValidate={true}
    >
      <div className={styles.heading}>
        {/*
          В выпадающем списке заголовка нет вовсе, и дело не только в высоте:
          прямо над формой там уже написано «Извините, ничего не нашлось», и
          второй раз сказать то же самое — значит потратить на повтор две
          строки высоты попапа. Заодно снимается
          вопрос об уровне: `h2` посреди подсказок ломал бы их порядок.
        */}
        {!isCompact && (
          <Heading level={2} size="sm">
            {title}
          </Heading>
        )}

        <Text size="sm" tone="secondary">
          {description}
        </Text>
      </div>

      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Пожелание не отправилось">
          {error}
        </Alert>
      )}

      {!isSignedIn && (
        <div className={styles.contact}>
          <Input
            label="Как вас зовут"
            value={values.name}
            onChange={next => change('name', next)}
            error={errors.name}
            autoComplete="name"
            disabled={isSubmitting}
          />

          <PhoneInput
            label="Телефон"
            hint="Ответим в WhatsApp или Telegram"
            value={values.phone}
            onChange={next => change('phone', next)}
            error={errors.phone}
            disabled={isSubmitting}
          />
        </div>
      )}

      {/*
        В попапе подпись поля уходит в `aria-label`, а поле сжимается до двух
        строк: попап поиска хоть и выше обычного списка
        (`EMPTY_ACTION_MAX_HEIGHT` в `HeaderSearch`), но на невысоком окне
        полная раскладка снова уводила бы кнопку отправки под прокрутку.
      */}
      <Textarea
        label={isCompact ? undefined : MESSAGE_LABEL}
        ariaLabel={MESSAGE_LABEL}
        placeholder="Например: тонер Anua с персиком, 250 мл"
        value={values.message}
        onChange={next => change('message', next)}
        error={errors.message}
        maxLength={MESSAGE_MAX_LENGTH}
        rows={isCompact ? 2 : 4}
        disabled={isSubmitting}
      />

      <Button type="submit" size={isCompact ? 'sm' : 'md'} isLoading={isSubmitting}>
        Отправить пожелание
      </Button>
    </form>
  )
}
