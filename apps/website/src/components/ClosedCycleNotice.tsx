import React from 'react'
import { Alert, Button } from 'widgets/atoms'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveCycle } from '@/hooks/useActiveCycle'
import { useLoginHref } from '@/hooks/useLoginHref'
import * as halloween from '@/halloween/halloween.css'

/**
 * Врезка «приём заказов закрыт» — одна на страницу.
 *
 * Кнопки «в корзину» в этом состоянии гаснут (см. `AddToCartButton`), и
 * подсказка над каждой объясняет, почему. Но в сетке из двух десятков карточек
 * причина, доступная только по наведению, — не объяснение: врезка говорит то
 * же самое один раз и сразу, а заодно показывает, что делать вместо.
 *
 * Пока состояние сбора неизвестно, не рисуется ничего: врезка, мигнувшая на
 * долю секунды при открытом сборе, хуже её отсутствия.
 */
export interface IClosedCycleNoticeProps {
  /**
   * Сезонный декор внутри врезки (свеча на Хэллоуин). Позиционируется
   * абсолютно от самой врезки и рисуется только вместе с ней — поэтому слот, а
   * не соседний блок: соседу пришлось бы отдельно знать, показана ли врезка.
   */
  decor?: React.ReactNode
}

export const ClosedCycleNotice: React.FC<IClosedCycleNoticeProps> = ({ decor }) => {
  const { isClosed } = useActiveCycle()
  const { user } = useAuth()
  const loginHref = useLoginHref()

  if (!isClosed) {
    return null
  }

  return (
    <Alert
      className={decor === undefined ? undefined : halloween.host}
      tone="info"
      title="Приём заказов закрыт"
      action={
        <Button
          size="sm"
          variant="secondary"
          // Гостю показывать пустое избранное незачем — сначала вход.
          link={{ href: user === null ? loginHref : '/wishlist' }}
        >
          {user === null ? 'Войти' : 'Моё избранное'}
        </Button>
      }
    >
      Сейчас нет открытого сбора, поэтому товары нельзя добавить в корзину. Сохраните понравившееся
      в избранное - о следующем сборе бот сообщит в Telegram.
      {decor}
    </Alert>
  )
}
