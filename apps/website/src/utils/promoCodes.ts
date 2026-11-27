import type {
  IAdminPromoCode,
  IAdminPromoCodeInitialValues,
  IAdminPromoCodeValues,
} from 'widgets/types'
import type { IPromoCodeInput } from '@/services/endpoints/promoCodes'
import type { IDeleteConfirmation } from '@/utils/promotions'

/**
 * Промокоды владельца в админке: перевод значений формы в тело запроса, «дубль» и
 * тексты подтверждений. Живёт в приложении, а не в виджетах: это знание страниц.
 */

/** Значения формы → тело `POST`/`PUT`. Пустое описание - `null`; без покупателей код общий. */
export const toPromoCodeInput = (values: IAdminPromoCodeValues): IPromoCodeInput => ({
  code: values.code,
  title: values.title,
  descriptionHtml: values.descriptionHtml === '' ? null : values.descriptionHtml,
  startsAt: values.startsAt,
  endsAt: values.endsAt,
  isEnabled: values.isEnabled,
  assignedUserIds: values.assignedUsers.map(user => user.id),
  usesPerCustomer: values.usesPerCustomer,
  conditions: values.conditions,
  rewards: values.rewards,
})

/** Сохранённый промокод → начальные значения формы (без служебных полей ответа). */
export const initialValuesOf = (promoCode: IAdminPromoCode): IAdminPromoCodeInitialValues => ({
  code: promoCode.code,
  title: promoCode.title,
  descriptionHtml: promoCode.descriptionHtml,
  startsAt: promoCode.startsAt,
  endsAt: promoCode.endsAt,
  isEnabled: promoCode.isEnabled,
  assignedUsers: promoCode.assignedUsers,
  usesPerCustomer: promoCode.usesPerCustomer,
  conditions: promoCode.conditions,
  rewards: promoCode.rewards,
})

/**
 * Копия промокода для формы добавления. Отдельного эндпоинта нет - «Дублировать»
 * целиком клиентское: форма открывается предзаполненной, а сохраняется обычным
 * созданием.
 *
 * Что намеренно не копируется: сам код (форма подставит копии новый - строка уникальна),
 * даты (их придётся выбрать заново; бессрочный остаётся бессрочным), включённость
 * (копия не должна сработать, пока её не проверили) и покупатели (копия для тех же людей
 * дала бы им второй такой же код).
 */
export const duplicateOf = (promoCode: IAdminPromoCode): IAdminPromoCodeInitialValues => ({
  ...initialValuesOf(promoCode),
  code: null,
  title: `${promoCode.title} (копия)`,
  startsAt: '',
  endsAt: promoCode.endsAt === null ? null : '',
  isEnabled: false,
  assignedUsers: [],
})

/**
 * Что спросить перед удалением. Бэкенд удаляет промокод, только если его никто не
 * применял; иначе - архив (`deletedAt`): за ним остаются заявки и сама строка кода,
 * которая навсегда занята.
 */
export const deleteConfirmation = (promoCode: IAdminPromoCode): IDeleteConfirmation =>
  promoCode.participantsCount > 0
    ? {
        title: 'Убрать промокод в архив?',
        description: `Промокод ${promoCode.code} уже применяли (${promoCode.participantsCount}), поэтому насовсем он не удалится: уйдёт в архив. Применить его больше нельзя, а скидки в заявках останутся. Строка кода останется занятой.`,
        confirmLabel: 'В архив',
      }
    : {
        title: 'Удалить промокод?',
        description: `Промокод ${promoCode.code} перестанет работать. Если его когда-то применяли (в том числе в отменённых заявках), он уйдёт в архив, а не удалится совсем - строка кода останется занятой.`,
        confirmLabel: 'Удалить',
      }
