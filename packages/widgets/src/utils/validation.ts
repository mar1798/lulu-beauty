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

export const NAME_MAX_LENGTH = 255

export const validatePhone = (phone: string): string | null => {
  if (phone === '') {
    return 'Укажите номер телефона.'
  }

  /*
    Текст — про то, что здесь и проверяется. «Нужно 9 цифр» описывало не эту
    проверку, а `PhoneInput` с кыргызским префиксом: на `+79161234567` она
    проходит, а человеку сообщалось, что цифр не столько, сколько надо.
  */
  if (!PHONE_PATTERN.test(phone)) {
    return 'Проверьте номер: он должен быть в виде +996555123456.'
  }

  return null
}

export const validateName = (name: string): string | null => {
  if (name.trim() === '') {
    return 'Как к вам обращаться?'
  }

  // По обрезанному: наружу (и в `UserUpdateRequest`) уходит тоже обрезанное,
  // и предел должен считаться от той же строки, которую проверит бэкенд.
  if (name.trim().length > NAME_MAX_LENGTH) {
    return `Имя длиннее ${NAME_MAX_LENGTH} символов.`
  }

  return null
}
