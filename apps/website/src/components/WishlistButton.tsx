import React, { useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import type { IControlSize } from 'widgets/types'
import { IconButton, Tooltip } from 'widgets/atoms'
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
 *
 * Форма у неё одна — круглое сердце, и в карточке, и на странице товара:
 * подписанной кнопкой она делила строку с «в корзину» пополам и читалась
 * равной ей, хотя главное действие страницы одно. Поведение тоже одно:
 * нажатие сохраняет, повторное — убирает. Везде.
 */
export const WishlistButton: React.FC<{
  productId: string
  /**
   * Название товара для тостов. Нужно именно пропом: у ещё не сохранённого
   * товара имени взять неоткуда — в избранном его нет, а тост о сохранении
   * пишется до того, как список успеет ответить.
   */
  productName?: string
  /** Белая заливка с тенью — для угла фотографии в карточке каталога. */
  variant?: 'ghost' | 'solid'
  size?: IControlSize
  /**
   * Подсказка над сердцем. Нужна на странице товара: рядом стоит подписанная
   * «В корзину», и безымянный круг возле неё обязан называть себя хотя бы при
   * наведении и с клавиатуры. В сетке каталога сердца стоят рядами, и пузырь
   * над каждым мешал бы смотреть товары.
   */
  withTooltip?: boolean
}> = ({ productId, productName, variant = 'solid', size = 'md', withTooltip = false }) => {
  const router = useRouter()
  const { user, isLoading: isAuthLoading, reload: reloadSession } = useAuth()
  const { wishlist, has, toggle, add, isItemBusy } = useWishlist()
  const { notify } = useToast()

  /**
   * Клик уже обрабатывается. Ref, а не состояние: показывать эту фазу кнопка
   * всё равно не должна, а перерисовка ради неё только вернула бы мигание.
   */
  const isRunning = useRef(false)

  const isSaved = has(productId)

  /*
    Название снимается до нажатия: после удаления товара в списке уже нет, а
    тост о нём — единственное место, где видно, что именно убрано (в каталоге
    карточка остаётся на месте, меняется одна заливка сердца). Проп важнее
    списка: у несохранённого товара списка нет вовсе.
  */
  const name =
    productName ?? wishlist?.items.find(item => item.product.id === productId)?.product.name

  /**
   * Возврат только что убранного товара. Избранное ничего не фиксирует — ни
   * цены, ни количества, — поэтому вернуть его значит просто сохранить снова.
   */
  const restore = useCallback(async (): Promise<void> => {
    const result = await add(productId)

    notify(
      result.ok
        ? {
            tone: 'success',
            title: name === undefined ? 'Товар снова в избранном' : `«${name}» снова в избранном`,
          }
        : {
            tone: 'danger',
            title: 'Вернуть не получилось',
            description: result.error ?? 'Попробуйте ещё раз или обновите страницу',
          }
    )
  }, [add, productId, name, notify])

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
          description: result.error ?? 'Попробуйте ещё раз или обновите страницу',
        })

        return
      }

      /*
        Говорим об обоих исходах. Об убранном — потому что оно исчезает: на
        странице избранного вместе с карточкой, в каталоге — одной сменой
        заливки, которую легко не заметить, нажав мимо; вернуть его без тоста
        можно только вспомнив, что это был за товар. О сохранённом — потому что
        заливки сердца и счётчика в шапке не хватает: в углу фотографии смену
        замечают не сразу, а на странице товара сердце стоит сбоку от кнопки,
        на которую в этот момент и смотрят.

        Отличаются они не только словами: убранное предлагает вернуть, а
        сохранённое — посмотреть, где оно теперь лежит.
      */
      if (isSaved) {
        notify({
          tone: 'warning',
          title: name === undefined ? 'Товар убран из избранного' : `«${name}» убран из избранного`,
          action: {
            label: 'Вернуть',
            onAction: () => {
              void restore()
            },
          },
        })
      } else {
        notify({
          tone: 'success',
          title: name === undefined ? 'Товар в избранном' : `«${name}» в избранном`,
          action: {
            label: 'Посмотреть',
            onAction: () => {
              void router.push('/wishlist')
            },
          },
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
    name,
    notify,
    restore,
  ])

  const onClick = (): void => {
    void run()
  }

  // Состояние читается заливкой, а не оттенком: разницу в цвете видят не все.
  const icon = isSaved ? <IconHeartFilled /> : <IconHeart />
  /* Подпись называет, что произойдёт от нажатия. Она же — текст подсказки:
     доступное имя и видимый текст обязаны совпадать. */
  const label = isSaved ? 'Убрать из избранного' : 'Добавить в избранное'

  const button = (
    <IconButton
      icon={icon}
      label={label}
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

  return withTooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
