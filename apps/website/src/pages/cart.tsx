import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Button } from 'widgets/atoms'
import { EmptyState } from 'widgets/molecules'
import { CartPanel } from 'widgets/organisms'
import { CartTemplate } from 'widgets/templates'
import { useToast } from 'widgets/contexts'
import { SiteLayout } from '@/layouts/SiteLayout'
import { EditableOrderNotice } from '@/components/EditableOrderNotice'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import * as styles from '@/styles/layout.css'

/**
 * Корзина. Приватная и целиком клиентская: данные идут через прокси,
 * статикой её отдавать нечего.
 *
 * Гостя не редиректим, а показываем предложение войти: корзина на бэкенде
 * привязана к пользователю, и внезапный переход на `/login` из шапки
 * выглядел бы как ошибка.
 */
const CartPage: React.FC = () => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const { cart, isLoading, isWholeCartBusy, isItemBusy, error, updateItem, removeItem, addItem } =
    useCart()
  const { notify } = useToast()

  /**
   * Возврат только что убранного товара.
   *
   * Добавлением, а не «отменой удаления»: на бэкенде корзина — это набор
   * позиций по товару, и вернуть строку с прежним количеством значит
   * положить её заново (`POST /cart/items`). Цена при этом берётся текущая —
   * та же, что и у любого другого товара в корзине, снимок снимается только
   * при подтверждении заявки.
   */
  const restore = async (productId: string, quantity: number): Promise<void> => {
    const result = await addItem(productId, quantity)

    notify(
      result.ok
        ? { tone: 'success', title: 'Товар вернулся в корзину' }
        : {
            tone: 'danger',
            title: 'Вернуть не получилось',
            // Чаще всего это закрывшийся сбор: он же закрывает и саму корзину.
            description: result.error ?? 'Попробуйте добавить товар из каталога',
          }
    )
  }

  /**
   * Удаление позиции. Тост с «Вернуть» — не вежливость, а единственный путь
   * назад: строка исчезает мгновенно (оптимистично), и промах по крестику на
   * телефоне иначе стоил бы похода в каталог за тем же товаром.
   */
  const remove = async (productId: string): Promise<void> => {
    const item = cart?.items.find(cartItem => cartItem.productId === productId)
    const result = await removeItem(productId)

    if (!result.ok) {
      notify({
        tone: 'danger',
        title: 'Товар не убран',
        description: result.error ?? 'Попробуйте ещё раз или обновите страницу',
      })

      return
    }

    // Количество известно только до удаления — поэтому оно снято выше.
    const quantity = item?.quantity ?? 1

    notify({
      // Предупреждение, а не «просто сообщение»: из корзины пропала строка,
      // и тост существует затем, чтобы это можно было отменить.
      tone: 'warning',
      title: item === undefined ? 'Товар убран из корзины' : `«${item.productName}» убран`,
      action: {
        label: 'Вернуть',
        onAction: () => {
          void restore(productId, quantity)
        },
      },
    })
  }

  const content = (): React.ReactNode => {
    // Пока сессия не проверена, «войдите» показывать нельзя: у залогиненного
    // это была бы вспышка чужого экрана вместо его корзины.
    if (user === null && !isAuthLoading) {
      return (
        <EmptyState
          title="Корзина у каждого своя"
          description="Войдите, чтобы собрать заявку — она сохранится до закрытия сбора"
          action={
            <Button link={{ href: '/login' }} isFullWidth="mobile">
              Войти
            </Button>
          }
        />
      )
    }

    return (
      <>
        {/*
          Только над непустой корзиной: у пустой добавлять в открытую заявку
          нечего, и врезка была бы просто ещё одним сообщением на экране.
        */}
        {cart !== null && cart.items.length > 0 && <EditableOrderNotice />}

        <CartPanel
          cart={cart}
          // Скелетон, а не спиннер: раскладка корзины известна заранее, и
          // подменять её кружком значит переложить страницу дважды.
          isLoading={isAuthLoading || isLoading}
          // Оформление ждёт только запрос по корзине целиком: на изменение
          // количества оно не реагирует, иначе кнопка мигала бы на каждое нажатие.
          isBusy={isWholeCartBusy}
          isItemBusy={isItemBusy}
          error={error}
          buildProductHref={slug => `/catalog/${slug}`}
          onQuantityChange={(productId, quantity) => {
            void updateItem(productId, quantity)
          }}
          onRemove={productId => {
            void remove(productId)
          }}
          onCheckout={() => {
            void router.push('/checkout')
          }}
          emptyState={
            <EmptyState
              title="Пока пусто"
              // Вторая фраза — не реклама избранного, а ответ на «где мой прошлый
              // выбор»: корзину закрывшегося сбора туда переносит планировщик
              // (apps/api/app/cycles/scheduler_service.py), и человек, пропустивший
              // уведомление бота, узнаёт об этом только здесь.
              description="Загляните в каталог — товары появляются перед каждым сбором. То, что вы не успели оформить в прошлом сборе, ждёт в избранном."
              action={
                <Button link={{ href: '/catalog' }} isFullWidth="mobile">
                  В каталог
                </Button>
              }
            />
          }
        />
      </>
    )
  }

  return (
    <SiteLayout>
      <Head>
        <title>Корзина — Sululu</title>
        <meta name="robots" content="noindex" />
      </Head>

      <CartTemplate
        title="Корзина"
        summary="Оплата не проводится: это заявка, которую мы подтвердим после закрытия сбора"
      >
        {/*
          Высота под содержимое зарезервирована: «войдите» и корзина отличаются
          высотой вдвое, и на ответе `/api/auth/me` подвал переезжал (см.
          `styles/layout.css`).
        */}
        <div className={styles.sessionArea}>{content()}</div>
      </CartTemplate>
    </SiteLayout>
  )
}

export default CartPage
