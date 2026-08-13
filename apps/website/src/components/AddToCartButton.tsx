import React, { useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import type { IControlSize } from 'widgets/types'
import { Button, IconButton, Tooltip } from 'widgets/atoms'
import { useToast } from 'widgets/contexts'
import { IconCheck, IconPlus } from 'widgets/svg'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useActiveCycle } from '@/hooks/useActiveCycle'

/**
 * Кнопка «В корзину» для карточки и страницы товара.
 *
 * Живёт в `apps/website`, а не в `widgets`: ей нужны и корзина, и сессия, и
 * роутер. В виджетах для неё оставлены слоты (`action`/`renderAction`).
 *
 * Гостя отправляем на вход, а не показываем ошибку: корзина на бэкенде
 * привязана к пользователю, анонимной корзины не существует.
 *
 * Когда открытого сбора нет, кнопка гаснет заранее: `POST /cart/items` в этом
 * состоянии отвечает 409 `no_active_cycle`, и это известно ещё до нажатия (см.
 * `useActiveCycle`). Гонку это не закрывает — сбор может закрыться между
 * рендером и кликом, — поэтому разбор ответа ниже остаётся на месте.
 *
 * Спиннера на время запроса нет — как и на сердце «в избранное»
 * (`WishlistButton`). Ответ приходит за те же ~200 мс, что кнопка успевает
 * показать спиннер и тут же сменить его на «в корзине»: читалось это не как
 * «идёт запрос», а как мигание. Двойной клик закрыт замком в `add`.
 */

/**
 * Почему нажать нельзя. Тот же текст уходит и в подсказку, и в скрытую подпись
 * кнопки: сказать «недоступно», не сказав почему, хуже, чем не гасить вовсе.
 */
const CLOSED_REASON = 'Сейчас нет открытого сбора — товар можно сохранить в избранное'

export const AddToCartButton: React.FC<{
  productId: string
  size?: IControlSize
  isFullWidth?: boolean
  disabled?: boolean
  /**
   * Круглая кнопка-иконка вместо кнопки с текстом — форма действия в карточке
   * каталога: в строке с ценой на текст места нет ни на одной ширине.
   */
  isCompact?: boolean
}> = ({ productId, size = 'sm', isFullWidth = false, disabled = false, isCompact = false }) => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading, reload: reloadSession } = useAuth()
  const { cart, addItem, isItemBusy } = useCart()
  const { isClosed } = useActiveCycle()
  const { notify } = useToast()

  /**
   * Клик уже обрабатывается — от ожидания сессии до ответа корзины. Ref, а не
   * состояние: показывать эту фазу кнопка не должна, и перерисовка ради неё
   * только вернула бы мигание.
   */
  const isRunning = useRef(false)

  const add = useCallback(async (): Promise<void> => {
    /*
      Второй клик по неответившей кнопке добавил бы товар повторно: `cart` в
      этот момент ещё без него, и до ветки «уже в корзине» дело не доходит.
    */
    if (isRunning.current || isItemBusy(productId)) {
      return
    }

    isRunning.current = true

    try {
      /*
        Пока `/api/auth/me` не ответил, `user === null` ещё не значит «гость»,
        и уводить на `/login` рано — дожидаемся ответа прямо в обработчике.
        Раньше кнопка на это время выключалась, и вся сетка каталога успевала
        мигнуть приглушёнными кнопками сразу после загрузки страницы.
      */
      const current = isAuthLoading ? await reloadSession() : user

      if (current === null) {
        void router.push({ pathname: '/login', query: { next: router.asPath } })

        return
      }

      const result = await addItem(productId)

      if (!result.ok) {
        /*
          Причину показываем словами корзины, а не общим «попробуйте ещё раз»:
          закрытый сбор, снятый с продажи товар и истёкшая сессия чинятся
          по-разному, и из «не получилось» человек ничего из этого не поймёт.
        */
        notify({
          tone: 'danger',
          title: 'Товар не добавлен',
          description: result.error ?? 'Попробуйте ещё раз или обновите страницу.',
        })
      }
    } finally {
      isRunning.current = false
    }
  }, [user, isAuthLoading, reloadSession, router, addItem, isItemBusy, productId, notify])

  const isInCart = cart?.items.some(item => item.productId === productId) === true

  if (isInCart) {
    /*
      В карточке «уже в корзине» — та же круглая кнопка, но белая с галочкой:
      состояние читается формой заливки, а не длиной подписи, и продолжает
      вести в корзину.
    */
    return isCompact ? (
      <IconButton
        icon={<IconCheck />}
        label="В корзине — перейти в корзину"
        variant="solid"
        size="md"
        onClick={() => void router.push('/cart')}
      />
    ) : (
      <Button variant="secondary" size={size} isFullWidth={isFullWidth} link={{ href: '/cart' }}>
        В корзине
      </Button>
    )
  }

  const onClick = (): void => {
    void add()
  }

  /*
    `disabled` (нет в наличии) и «сбор закрыт» — разные вещи, и ведут себя они
    по-разному: первое выключает кнопку насовсем, второе оставляет её в
    табуляции ради подсказки. Приоритет у `disabled`: объяснять закрытый сбор
    на товаре, которого всё равно нет, незачем.
  */
  const unavailableReason = !disabled && isClosed ? CLOSED_REASON : null

  const button = isCompact ? (
    <IconButton
      icon={<IconPlus />}
      label="В корзину"
      variant="primary"
      size="md"
      disabled={disabled}
      unavailableReason={unavailableReason}
      onClick={onClick}
    />
  ) : (
    <Button
      size={size}
      isFullWidth={isFullWidth}
      disabled={disabled}
      unavailableReason={unavailableReason}
      onClick={onClick}
    >
      {/*
        С «добавить», в отличие от круглой кнопки в карточке: подпись стоит
        рядом с «добавить в избранное» на странице товара, и без глагола пара
        читается как два названия разделов, а не как два действия.
      */}
      Добавить в корзину
    </Button>
  )

  // Подсказка появляется только когда есть что объяснять: над рабочей кнопкой
  // пузырь «в корзину» ничего не добавил бы к её же подписи.
  return unavailableReason === null ? (
    button
  ) : (
    <Tooltip content={unavailableReason} isBlock={isFullWidth}>
      {button}
    </Tooltip>
  )
}
