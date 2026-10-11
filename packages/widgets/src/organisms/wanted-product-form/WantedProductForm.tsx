import clsx from 'clsx'
import { type FC, type FormEvent, useState } from 'react'
import type { IBasicStyling, IWantedProductFormProps, IWantedProductValues } from '../../types'
import { Alert } from '../../atoms/alert'
import { AppLink } from '../../atoms/app-link'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import { Textarea } from '../../atoms/textarea'
import * as styles from './WantedProductForm.css'

/**
 * «Не нашли? Расскажите, что искали» — пожелание к следующему сбору.
 *
 * Стоит там, где поиск ничем не помог: под пустой выдачей в шапке и под
 * короткой выборкой каталога. Смысл у блока ровно один — не отпускать человека
 * с пустой страницы, поэтому он не спрашивает ничего, кроме текста.
 *
 * Только для вошедших: контакт для ответа бэкенд берёт с аккаунта, а гостю
 * вместо поля показывается кнопка входа (`onSignIn`). Имени и телефона форма
 * не спрашивает ни у кого — набранный в публичной форме номер может оказаться
 * чьим угодно.
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

export const WantedProductForm: FC<IWantedProductFormProps & IBasicStyling> = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  isSignedIn = false,
  onSignIn,
  contact,
  onSubmit,
  isSubmitting = false,
  error,
  isSent = false,
  isCompact = false,
  className,
}) => {
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState<string | undefined>(undefined)

  const change = (next: string): void => {
    setMessage(next)
    /* Правка поля снимает его же ошибку: висящая подпись под уже исправленной
       строкой читается как вторая претензия, а не как прошлая. */
    setMessageError(undefined)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (message.trim() === '') {
      setMessageError('Напишите, что вы ищете')
      return
    }

    const values: IWantedProductValues = { message: message.trim() }
    onSubmit(values)
  }

  const heading = (
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
  )

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

  /*
    Гостю — то же приглашение, но вместо поля кнопка входа: писать текст,
    который потом некуда отправить, хуже, чем узнать об этом сразу. Прямой
    контакт — в той же фразе, как второй путь: входить ради одного вопроса
    хочется не всем.
  */
  if (!isSignedIn) {
    return (
      <div className={clsx(styles.container, isCompact && styles.compact, className)}>
        {heading}

        <Text size="sm">
          Оставить пожелание можно после входа - так мы сможем вам ответить.
          {contact !== undefined && (
            <>
              {' '}
              Или напишите нам напрямую в{' '}
              <AppLink className={styles.contactLink} {...contact.link}>
                {contact.label}
              </AppLink>
              .
            </>
          )}
        </Text>

        <Button type="button" size={isCompact ? 'sm' : 'md'} onClick={onSignIn}>
          Войти через Telegram
        </Button>
      </div>
    )
  }

  return (
    <form
      className={clsx(styles.container, isCompact && styles.compact, className)}
      onSubmit={handleSubmit}
      noValidate={true}
    >
      {heading}

      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Пожелание не отправилось">
          {error}
        </Alert>
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
        value={message}
        onChange={change}
        error={messageError}
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
