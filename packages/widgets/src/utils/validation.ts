/**
 * Проверки полей форм авторизации.
 *
 * Правила повторяют схемы бэкенда (`apps/api/app/users/schemas.py`,
 * `app/common/phone.py`) — это не замена серверной проверки, а способ не
 * гонять человека на сервер за очевидной опечаткой. Возвращают текст ошибки
 * или `null`, если поле в порядке.
 */

/** `PHONE_PATTERN` бэкенда: E.164. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/

const NAME_MAX_LENGTH = 255

export const validatePhone = (phone: string): string | null => {
  if (phone === '') {
    return 'Укажите номер телефона.'
  }

  if (!PHONE_PATTERN.test(phone)) {
    return 'Проверьте номер: нужно 9 цифр после кода страны.'
  }

  return null
}

export const validateName = (name: string): string | null => {
  if (name.trim() === '') {
    return 'Как к вам обращаться?'
  }

  if (name.length > NAME_MAX_LENGTH) {
    return 'Имя слишком длинное.'
  }

  return null
}
