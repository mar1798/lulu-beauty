import React from 'react'
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
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, addItem, isBusy } = useCart()
  const { notify } = useToast()

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

  const handleAdd = async (): Promise<void> => {
    /*
      Пока `/api/auth/me` не ответил, `user` — `null`, и это ещё не значит
      «гость». Раньше клик в этот момент уводил вошедшего покупателя на
      `/login` вместо добавления товара; теперь кнопка на это время выключена
      (см. `isPending`), а сюда мы попасть уже не должны.
    */
    if (isAuthLoading) {
      return
    }

    if (user === null) {
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
  }

  const onClick = (): void => {
    void handleAdd()
  }

  /** Сессия ещё проверяется или корзина занята — жать бессмысленно. */
  const isPending = isAuthLoading || isBusy

  if (isCompact) {
    return (
      <IconButton
        icon={<IconPlus />}
        label="В корзину"
        variant="primary"
        size="md"
        disabled={disabled || isPending}
        onClick={onClick}
      />
    )
  }

  return (
    <Button
      size={size}
      isFullWidth={isFullWidth}
      disabled={disabled || isAuthLoading}
      isLoading={isBusy}
      onClick={onClick}
    >
      В корзину
    </Button>
  )
}
