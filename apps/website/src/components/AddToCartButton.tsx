import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/router'
import type { IControlSize } from 'widgets/types'
import { Button, IconButton } from 'widgets/atoms'
import { useToast } from 'widgets/contexts'
import { IconCheck, IconPlus } from 'widgets/svg'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'

/**
 * Кнопка «В корзину» для карточки и страницы товара.
 *
 * Живёт в `apps/website`, а не в `widgets`: ей нужны и корзина, и сессия, и
 * роутер. В виджетах для неё оставлены слоты (`action`/`renderAction`).
 *
 * Гостя отправляем на вход, а не показываем ошибку: корзина на бэкенде
 * привязана к пользователю, анонимной корзины не существует.
 */
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
  const { notify } = useToast()

  /** Клик обрабатывается — от ожидания сессии до ответа корзины. */
  const [isSubmitting, setIsSubmitting] = useState(false)

  const add = useCallback(async (): Promise<void> => {
    setIsSubmitting(true)

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

      if (!(await addItem(productId))) {
        notify({
          tone: 'danger',
          title: 'Не удалось добавить товар',
          description: 'Попробуйте ещё раз или обновите страницу.',
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [user, isAuthLoading, reloadSession, router, addItem, productId, notify])

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

  /**
   * Занята ровно эта позиция. Общий флаг корзины сюда не годится: с ним
   * добавление одного товара гасило бы кнопки у всех остальных карточек на
   * экране — клик по одной карточке мигал бы всей сеткой.
   */
  const isPending = isSubmitting || isItemBusy(productId)

  if (isCompact) {
    return (
      <IconButton
        icon={<IconPlus />}
        label="В корзину"
        variant="primary"
        size="md"
        disabled={disabled}
        isLoading={isPending}
        onClick={onClick}
      />
    )
  }

  return (
    <Button
      size={size}
      isFullWidth={isFullWidth}
      disabled={disabled}
      isLoading={isPending}
      onClick={onClick}
    >
      В корзину
    </Button>
  )
}
