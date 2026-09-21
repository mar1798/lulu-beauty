import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import type { IControlSize, IProduct } from 'widgets/types'
import { Button, IconButton, Tooltip } from 'widgets/atoms'
import { useToast } from 'widgets/contexts'
import { IconCart, IconCheck, IconPlus } from 'widgets/svg'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useActiveCycle } from '@/hooks/useActiveCycle'
import * as styles from '@/styles/cartButton.css'

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
 *
 * В корзину кладётся **объём**, а не товар. У товара, который продаётся в
 * нескольких, кнопка в сетке каталога не кладёт ничего: выбрать объём там
 * негде — в строке с ценой нет места ни на одной ширине, — и она ведёт на
 * страницу товара, где переключатель есть. Молча класть самый дешёвый было бы
 * решением за покупателя, а прятать кнопку — терять единственное действие
 * карточки.
 */

/**
 * Почему нажать нельзя. Тот же текст уходит и в подсказку, и в скрытую подпись
 * кнопки: сказать «недоступно», не сказав почему, хуже, чем не гасить вовсе.
 */
const CLOSED_REASON = 'Сейчас нет открытого сбора — товар можно сохранить в избранное'

/**
 * Сколько круглая кнопка держит галочку после добавления, мс.
 *
 * Галочка отвечает на клик («добавили»), но действием она не читается: это
 * знак завершённости, и человек не догадывался, что тот же круг ведёт в
 * корзину. Поэтому подтверждение живёт ровно столько, чтобы его заметили, а
 * дальше кнопка меняет знак на корзину — ту же, что в шапке, — и дальше
 * читается как переход.
 *
 * Секунда с небольшим: меньше — галочку не успевают увидеть те, кто уже
 * увёл взгляд к следующей карточке; больше — подмена происходит, когда на
 * кнопку уже никто не смотрит, и смысла в ней нет.
 */
const CONFIRMATION_MS = 1200

export const AddToCartButton: React.FC<{
  /**
   * Товар целиком: кнопке нужно знать не только, что класть, но и сколько у
   * него объёмов — от этого зависит, кладёт она или ведёт выбирать.
   */
  product: IProduct
  /**
   * Выбранный объём. Задаётся на странице товара, где есть переключатель; в
   * сетке каталога опущен — там объём выбирают не здесь.
   */
  variantId?: string | null
  size?: IControlSize
  isFullWidth?: boolean
  disabled?: boolean
  /**
   * Круглая кнопка-иконка вместо кнопки с текстом — форма действия в карточке
   * каталога: в строке с ценой на текст места нет ни на одной ширине.
   */
  isCompact?: boolean
}> = ({
  product,
  variantId,
  size = 'sm',
  isFullWidth = false,
  disabled = false,
  isCompact = false,
}) => {
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

  /*
    Что именно кладём. Явно выбранный объём, иначе единственный — а у товара с
    несколькими объёмами без выбора класть нечего, и это `null`.
  */
  const target =
    product.variants.find(variant => variant.id === variantId) ??
    (product.variants.length === 1 ? product.variants[0] : null)

  /**
   * Товар положили прямо сейчас — кнопка держит галочку подтверждения. Через
   * `CONFIRMATION_MS` состояние гаснет само, и на её место встаёт корзина.
   *
   * Состояние поднято на кнопку, а не выведено из корзины: в корзине лежит
   * только факт «товар там», а «положили секунду назад» знает лишь тот
   * экземпляр кнопки, по которому нажали.
   */
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    if (!isConfirming) {
      return
    }

    const timer = window.setTimeout(() => setIsConfirming(false), CONFIRMATION_MS)

    return () => window.clearTimeout(timer)
  }, [isConfirming])

  const add = useCallback(async (): Promise<void> => {
    /*
      Второй клик по неответившей кнопке добавил бы товар повторно: `cart` в
      этот момент ещё без него, и до ветки «уже в корзине» дело не доходит.
    */
    if (target === null || isRunning.current || isItemBusy(target.id)) {
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

      const result = await addItem(target.id)

      if (result.ok) {
        setIsConfirming(true)
      } else {
        /*
          Причину показываем словами корзины, а не общим «попробуйте ещё раз»:
          закрытый сбор, снятый с продажи товар и истёкшая сессия чинятся
          по-разному, и из «не получилось» человек ничего из этого не поймёт.
        */
        notify({
          tone: 'danger',
          title: 'Товар не добавлен',
          description: result.error ?? 'Попробуйте ещё раз или обновите страницу',
        })
      }
    } finally {
      isRunning.current = false
    }
  }, [user, isAuthLoading, reloadSession, router, addItem, isItemBusy, target, notify])

  /*
    Объём не выбран, а выбирать есть из чего: кнопка ведёт на страницу товара.
    Ссылкой, а не обработчиком, — по тем же четырём признакам перехода, что и
    «в корзине» ниже: курсор, адрес в статусной строке, Cmd+клик, средняя кнопка.
  */
  if (target === null) {
    const href = `/catalog/${encodeURIComponent(product.slug)}`

    return isCompact ? (
      <IconButton
        icon={<IconPlus />}
        label={`Выбрать объём: ${product.name}`}
        variant="primary"
        size="md"
        link={{ href }}
      />
    ) : (
      <Button size={size} isFullWidth={isFullWidth} link={{ href }}>
        Выбрать объём
      </Button>
    )
  }

  const isInCart = cart?.items.some(item => item.variantId === target.id) === true

  if (isInCart) {
    /*
      В карточке «уже в корзине» — та же круглая кнопка, но белая: состояние
      читается формой заливки, а не длиной подписи. Знак внутри зависит от
      того, только что товар положили или он лежал там и раньше
      (`CONFIRMATION_MS`): сразу после клика — галочка, дальше — корзина.

      Ссылка, а не `router.push` по клику: переход обязан оставаться
      переходом. Курсор, адрес в статусной строке, Cmd+клик и средняя кнопка —
      четыре признака «ведёт в корзину», которых у `button` нет вовсе, и
      именно их не хватало, чтобы догадаться о переходе, не нажав.
    */
    return isCompact ? (
      <IconButton
        icon={
          <span key={isConfirming ? 'check' : 'cart'} className={styles.iconSwap}>
            {isConfirming ? <IconCheck /> : <IconCart />}
          </span>
        }
        label={isConfirming ? 'Добавлено — перейти в корзину' : 'В корзине — перейти в корзину'}
        variant="solid"
        size="md"
        link={{ href: '/cart' }}
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
        Без «добавить»: на странице товара эта кнопка стоит в одной строке с
        «в избранное», и на мобилке они делят ширину экрана пополам — с
        глаголом подпись переносилась на вторую строку. Действием она читается
        и так: рядом стоит вторичная кнопка, а не название раздела.
      */}
      В корзину
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
