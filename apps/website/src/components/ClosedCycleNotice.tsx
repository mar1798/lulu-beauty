import React from 'react'
import { Alert, Button } from 'widgets/atoms'
import { useAuth } from '@/contexts/AuthContext'
import { useActiveCycle } from '@/hooks/useActiveCycle'

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
export const ClosedCycleNotice: React.FC = () => {
  const { isClosed } = useActiveCycle()
  const { user } = useAuth()

  if (!isClosed) {
    return null
  }

  return (
    <Alert
      tone="info"
      title="Приём заказов закрыт"
      action={
        <Button
          size="sm"
          variant="secondary"
          // Гостю показывать пустое избранное незачем — сначала вход.
          link={{ href: user === null ? '/login' : '/wishlist' }}
        >
          {user === null ? 'Войти' : 'Моё избранное'}
        </Button>
      }
    >
      Сейчас нет открытого сбора, поэтому товары нельзя добавить в корзину. Сохраните
      понравившееся в избранное — о следующем сборе бот сообщит в Telegram.
    </Alert>
  )
}
