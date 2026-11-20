import type { IAdminPromotionInitialValues, IAdminPromotionValues, IPromotion } from 'widgets/types'
import type { IPromotionInput } from '@/services/endpoints/promotions'

/**
 * Акции в админке: перевод значений формы в тело запроса, «дубль» и тексты
 * подтверждений. Живёт в приложении, а не в виджетах: это знание страниц.
 */

/** Значения формы → тело `POST`/`PUT`. Пустое описание — `null`; баннеры уходят отдельно. */
export const toPromotionInput = (values: IAdminPromotionValues): IPromotionInput => ({
  slug: values.slug,
  title: values.title,
  descriptionHtml: values.descriptionHtml === '' ? null : values.descriptionHtml,
  startsAt: values.startsAt,
  endsAt: values.endsAt,
  isEnabled: values.isEnabled,
  announce: values.announce,
  sortOrder: values.sortOrder,
  conditions: values.conditions,
  rewards: values.rewards,
})

/** Сохранённая акция → начальные значения формы (без служебных полей ответа). */
export const initialValuesOf = (promotion: IPromotion): IAdminPromotionInitialValues => ({
  title: promotion.title,
  slug: promotion.slug,
  descriptionHtml: promotion.descriptionHtml,
  startsAt: promotion.startsAt,
  endsAt: promotion.endsAt,
  isEnabled: promotion.isEnabled,
  announce: promotion.announce,
  sortOrder: promotion.sortOrder,
  conditions: promotion.conditions,
  rewards: promotion.rewards,
})

/**
 * Копия акции для формы добавления. Отдельного эндпоинта нет — «Дублировать»
 * целиком клиентское: форма открывается предзаполненной, а сохраняется обычным
 * созданием.
 *
 * Что намеренно не копируется: даты — их придётся выбрать заново (копия с
 * прошедшим окном сразу была бы завершённой), включённость и анонс — копия не
 * должна выстрелить сама, пока её не проверили. Адрес занят оригиналом (он
 * уникален, в том числе у архивных), поэтому получает суффикс. Баннеры не
 * переносятся: файл принадлежит оригиналу.
 */
export const duplicateOf = (promotion: IPromotion): IAdminPromotionInitialValues => ({
  ...initialValuesOf(promotion),
  title: `${promotion.title} (копия)`,
  slug: `${promotion.slug}-copy`,
  startsAt: '',
  endsAt: '',
  isEnabled: false,
  announce: false,
})

export interface IDeleteConfirmation {
  title: string
  description: string
  confirmLabel: string
}

/**
 * Что спросить перед удалением. Бэкенд удаляет акцию, только если в ней никто
 * не участвовал; иначе — архив (`deletedAt`): за ней остаются заявки, выданные
 * коды и адрес. «Участников» в таблице — живые участия, а архив срабатывает и от
 * снятых (отменённая заявка тоже история), поэтому без живых участников текст
 * честно говорит «или», а не обещает полное удаление.
 */
export const deleteConfirmation = (promotion: IPromotion): IDeleteConfirmation =>
  promotion.participantsCount > 0
    ? {
        title: 'Убрать акцию в архив?',
        description: `В «${promotion.title}» уже участвуют заявки (${promotion.participantsCount}), поэтому насовсем она не удалится: уйдёт в архив. Покупатели её больше не увидят, а участие, подарки и выданные промокоды в заявках останутся. Адрес (slug) останется занят.`,
        confirmLabel: 'В архив',
      }
    : {
        title: 'Удалить акцию?',
        description: `«${promotion.title}» исчезнет у покупателей. Если в ней когда-то участвовали (в том числе отменённые заявки), она уйдёт в архив, а не удалится совсем.`,
        confirmLabel: 'Удалить',
      }
