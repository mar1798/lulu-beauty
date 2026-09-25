import type { IWantedProductValues } from 'widgets/types'
import { api } from '../api'

/**
 * Пожелание к следующему сбору: что покупатель искал и не нашёл.
 *
 * Публичная ручка - поиск, под которым стоит форма, работает и без аккаунта.
 * Имя и телефон уходят только от гостя: у вошедшего бэкенд берёт контакт с
 * аккаунта и присланные поля игнорирует (`app/wanted/service.py`), поэтому
 * отправлять пустые строки незачем.
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
    body: {
      message: values.message,
      name: values.name === '' ? undefined : values.name,
      phone: values.phone === '' ? undefined : values.phone,
    },
  })
