import React, { useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import type { IControlSize } from 'widgets/types'
import { Button, IconButton } from 'widgets/atoms'
import { useToast } from 'widgets/contexts'
import { IconHeart, IconHeartFilled } from 'widgets/svg'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/WishlistContext'

/**
 * «В избранное» для карточки и страницы товара.
 *
 * Живёт в `apps/website`, а не в `widgets`, по той же причине, что и
 * `AddToCartButton`: ей нужны и сессия, и состояние избранного, и роутер.
 *
 * Гостя отправляем на вход, а не показываем ошибку: избранное на бэкенде
 * привязано к пользователю, анонимного не существует.
 *
 * Кнопка есть всегда, а не только когда сбор закрыт: сохранить понравившееся
 * «на потом» человек хочет и при открытом приёме заказов.
 *
 * Спиннера на ней нет намеренно — в отличие от «в корзину». Запрос отвечает за
 * те же ~200 мс, что кнопка успевает показать спиннер и сразу убрать: получалось
 * не «идёт запрос», а мигание. Двойной клик при этом закрыт замком в `run`.
 */
export const WishlistButton: React.FC<{
  productId: string
  /** Белая заливка с тенью — для угла фотографии в карточке каталога. */
  variant?: 'ghost' | 'solid'
  size?: IControlSize
  /**
   * Кнопка с подписью вместо круглого сердца — форма действия на странице
   * товара: там она стоит в одной строке с «добавить в корзину» и обязана
   * читаться так же, а не как безымянная иконка рядом с ней.
   */
  withLabel?: boolean
  isFullWidth?: boolean
}> = ({
  productId,
  variant = 'solid',
  size = 'md',
  withLabel = false,
  isFullWidth = false,
}) => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading, reload: reloadSession } = useAuth()
  const { has, toggle, isItemBusy } = useWishlist()
  const { notify } = useToast()

  /**
   * Клик уже обрабатывается. Ref, а не состояние: показывать эту фазу кнопка
   * всё равно не должна, а перерисовка ради неё только вернула бы мигание.
   */
  const isRunning = useRef(false)

  const isSaved = has(productId)

  const run = useCallback(async (): Promise<void> => {
    // Второй клик по неответившей кнопке ушёл бы с тем же (устаревшим)
    // представлением о том, сохранён товар или нет, — то есть повторил бы
    // первый запрос вместо того, чтобы его отменить.
    if (isRunning.current || isItemBusy(productId)) {
      return
    }

    isRunning.current = true

    try {
      /*
        Пока `/api/auth/me` не ответил, `user === null` ещё не значит «гость» —
        дожидаемся ответа прямо в обработчике, а не гасим кнопку на это время
        (иначе вся сетка каталога мигала бы приглушёнными сердцами).
      */
      const current = isAuthLoading ? await reloadSession() : user

      if (current === null) {
        void router.push({ pathname: '/login', query: { next: router.asPath } })

        return
      }

      const result = await toggle(productId)

      if (!result.ok) {
        notify({
          tone: 'danger',
          title: isSaved ? 'Товар не убран' : 'Товар не сохранён',
          description: result.error ?? 'Попробуйте ещё раз или обновите страницу.',
        })
      }
    } finally {
      isRunning.current = false
    }
  }, [
    user,
    isAuthLoading,
    reloadSession,
    router,
    toggle,
    isItemBusy,
    productId,
    isSaved,
    notify,
  ])

  const onClick = (): void => {
    void run()
  }

  if (withLabel) {
    return (
      <Button
        /*
          Вторичная, а не акцентная: рядом стоит «добавить в корзину», и две
          розовые заливки в одной строке отменили бы порядок действий.

          Без иконки: состояние здесь читается самой подписью («в избранном» /
          «добавить в избранное»), и сердце рядом с ней ничего не добавляло —
          в отличие от круглой кнопки в карточке, где текста нет вовсе.
        */
        variant="secondary"
        size={size}
        isFullWidth={isFullWidth}
        onClick={onClick}
      >
        {isSaved ? 'В избранном' : 'Добавить в избранное'}
      </Button>
    )
  }

  // Состояние читается заливкой, а не оттенком: разницу в цвете видят не все.
  const icon = isSaved ? <IconHeartFilled /> : <IconHeart />

  return (
    <IconButton
      icon={icon}
      label={isSaved ? 'Убрать из избранного' : 'Добавить в избранное'}
      /*
        Сохранённое — единственная заливка марки в карточке: белое сердце на
        розовом видно в углу фотографии, а белая кнопка с розовым контуром на
        светлом снимке — уже нет.
      */
      variant={isSaved ? 'primary' : variant}
      size={size}
      onClick={onClick}
    />
  )
}
