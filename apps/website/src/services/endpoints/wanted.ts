import type { IWantedProductValues } from 'widgets/types'
import { api } from '../api'

/**
 * Пожелание к следующему сбору: что покупатель искал и не нашёл.
 *
 * Только для вошедших: контакт для ответа бэкенд берёт с аккаунта
 * (`app/wanted/service.py`), поэтому уходит один текст. Гость получит 401.
 *
 * Ответ - только расписка: читать эти записи некому, владельцу они приезжают
 * уведомлением бота.
 */

export interface IWantedProductReceipt {
  id: string
  createdAt: string
}

export const submitWantedProduct = (values: IWantedProductValues): Promise<IWantedProductReceipt> =>
  api.post('/wanted-products', {
    body: { message: values.message },
  })
