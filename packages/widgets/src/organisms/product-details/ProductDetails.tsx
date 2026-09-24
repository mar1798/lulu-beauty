import clsx from 'clsx'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { IBasicStyling, IProductDetailsProps } from '../../types'
import { Badge } from '../../atoms/badge'
import { Heading } from '../../atoms/heading'
import { Price } from '../../atoms/price'
import { Text } from '../../atoms/text'
import { ProductGallery } from '../../molecules/product-gallery'
import { VariantSelector } from '../../molecules/variant-selector'
import { CART_ACTION_TRANSITION } from '../../utils/motion'
import { formatVolume } from '../../utils/volume'
import * as styles from './ProductDetails.css'

/**
 * Ширина ужатой кнопки, px. Запасной ответ на те кадры, пока строку ещё не
 * померили: настоящий круг равен высоте строки, а она задана в `rem`
 * (`Button size="lg"`, `actionPrimaryCompact` и сердце рядом — все трое), и
 * при увеличенном системном шрифте эти 52 пикселя уже не она.
 */
const COMPACT_ACTION_WIDTH = 52

/**
 * Страница товара: галерея слева, описание справа.
 *
 * Кнопка «в корзину» приходит слотом `action`, «в избранное» —
 * `secondaryAction`, количество перед ними — `quantity`: все три завязаны на
 * активный цикл, авторизацию и состав корзины, а это состояние
 * `apps/website`, не виджета. Стоят действия в одной строке, и второе —
 * круглой иконкой: два подписанных действия делили строку пополам и читались
 * равными, хотя равными не являются.
 *
 * `isInCart` переключает строку действий между двумя видами. Пока позиции в
 * корзине нет, всё как прежде: подписанная кнопка во всю оставшуюся ширину.
 * Как только она там — подпись кнопке больше не нужна (человек только что
 * прочитал её и нажал), и кнопка уезжает в круг со знаком корзины, освобождая
 * место количеству, которое выезжает слева. Переход играется в обе стороны:
 * позицию убирают тем же количеством, и строка возвращается к исходному виду.
 *
 * Анимируется ширина — осознанное исключение из правила «только
 * transform/opacity» по тем же причинам, что раскрытие ответа в
 * `FaqAccordion`: `scaleX` расплющил бы и подпись, и круглую кнопку. Строка
 * одна, движение — ответ на явное нажатие, в скролл-кадре её нет.
 *
 * Товар, продающийся в нескольких объёмах, показывает переключатель, и цена с
 * наличием читаются уже с выбранного объёма, а не с товара: у товара
 * `priceCents` — это минимум («от»), а `inStock` — «хоть один объём есть», и
 * оба обещали бы не то, что покупатель сейчас положит в корзину. Строка с
 * ценой и меткой наличия — единственное место, где они названы: на самих
 * кнопках объёма их нет, и меняются они в ответ на выбор.
 * Описание выводится с `white-space: pre-line`: в импорте из xlsx переносы
 * строк осмысленные, и схлопывать их нельзя.
 */
export const ProductDetails: FC<IProductDetailsProps & IBasicStyling> = ({
  product,
  categoryName,
  selectedVariantId,
  onSelectVariant,
  quantity,
  isInCart = false,
  action,
  secondaryAction,
  note,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false
  /* Кнопка едет — ширину ей задаёт анимация, а не раскладка (см. `actionPrimaryCompact`). */
  const [isMorphing, setIsMorphing] = useState(false)
  const wasInCart = useRef(isInCart)
  const actionRef = useRef<HTMLDivElement>(null)
  /* Слот количества: на время замера его ужимают в ноль (см. `measureExpanded`). */
  const quantityRef = useRef<HTMLDivElement>(null)
  /* Вся строка целиком: её размер не зависит от того, что сейчас делает кнопка. */
  const rowRef = useRef<HTMLDivElement>(null)

  /*
    Движение начинается со сменой состояния — и флаг поднимается **на рендере**,
    а не эффектом. Эффектом нельзя: классы, которые он включает, обязаны быть на
    узле в том же кадре, в котором поехала ширина. Опоздай они на кадр — и
    `flex-grow`, ещё не снятый (`actionPrimaryFixed`), успеет разложить свободное
    место по строке и вернуть кнопке всю ширину, а подрезка включится уже поверх
    дёрнувшейся подписи.

    Сравнение с предыдущим значением через ref — первый рендер сюда не
    попадает: на нём ещё ничего никуда не едет.

    Заканчивается движение по сигналу самой анимации (`onAnimationComplete`
    ниже), а не по таймеру на ту же длительность: таймер идёт по часам,
    анимация по кадрам, и в неудачный момент растяжение возвращалось бы кнопке
    за кадр до конца её же поездки.

    Поднимать состояние из `onAnimationStart` тоже нельзя: тот срабатывает на
    каждый запуск, перерисовка узла запускает анимацию заново — и так по кругу,
    до полной остановки ширины на стартовом значении. Конец такого круга не
    образует: цель после него та же.
  */
  if (wasInCart.current !== isInCart) {
    wasInCart.current = isInCart

    if (!isMorphing) {
      setIsMorphing(true)
    }
  }

  /**
   * Ширина развёрнутой кнопки в пикселях — то, что насчитала раскладка.
   *
   * Анимации нужно ровно это число, и взять его больше неоткуда. `auto`
   * меряется по содержимому (а содержимое к этому моменту уже сменилось на
   * иконку), `100%` — по всей строке, из которой кнопке достаётся не всё:
   * рядом стоят сердце и количество. И то и другое даёт анимацию, первая
   * треть которой проходит за пределами видимого — кнопка просто стоит.
   */
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null)

  /**
   * Диаметр ужатой кнопки в пикселях — высота строки, померенная на месте.
   *
   * Не константа: высота задана в `rem` (`Button size="lg"`, сердце рядом и
   * `actionPrimaryCompact` — все трое), и при увеличенном системном шрифте
   * строка выше своих 52 пикселей. Анимация же ведёт ширину в пикселях, и
   * разойдись эти две величины — круг вышел бы овалом, да ещё и не такого
   * размера, как сердце в той же строке.
   */
  const [compactWidth, setCompactWidth] = useState(COMPACT_ACTION_WIDTH)

  /**
   * Ширина, которую раскладка дала бы развёрнутой кнопке **сейчас**.
   *
   * Меряется не «как есть»: к моменту замера на слоте могут висеть три вещи,
   * каждая из которых врёт про развёрнутый вид, — инлайновая ширина от
   * анимации, снятое растяжение (`actionPrimaryFixed`) и ещё не уехавшее
   * количество слева. Все три снимаются на одно синхронное измерение и
   * возвращаются на место, так что ни один кадр их отсутствия не виден.
   *
   * Класс снимается, а не подменяется значением `flex`: развёрнутый вид
   * растягивается только до `md`, а с `md` меряется по содержимому, и
   * повторять эту развилку из JS значит держать её в двух местах.
   */
  const measureExpanded = useCallback((): number | null => {
    const box = actionRef.current

    if (box === null) {
      return null
    }

    const width = box.style.width
    const hadFixed = box.classList.contains(styles.actionPrimaryFixed)
    const slot = quantityRef.current
    const slotWidth = slot === null ? null : slot.style.width

    box.style.width = ''

    if (hadFixed) {
      box.classList.remove(styles.actionPrimaryFixed)
    }

    if (slot !== null) {
      slot.style.width = '0px'
    }

    const measured = box.getBoundingClientRect().width

    box.style.width = width

    if (hadFixed) {
      box.classList.add(styles.actionPrimaryFixed)
    }

    if (slot !== null && slotWidth !== null) {
      slot.style.width = slotWidth
    }

    return measured
  }, [])

  /*
    Строка сменила размер — поворот экрана, смена объёма на более длинное
    название, изменённый системный шрифт. Прошлый замер после этого неверен, и
    наблюдатель его **сбрасывает**, а не обновляет: перемеряет тот, кто и так
    это умеет, — слой-эффект ниже, и сделает он это до отрисовки.

    Сбрасывать, а не мерить здесь, нужно ещё и ради позиции, лежащей в
    корзине: мерить её кнопку сейчас бессмысленно (она круглая), а к моменту,
    когда её уберут, замер обязан быть свежим. `null` в этом состоянии и
    означает «померить, когда понадобится».

    Наблюдатель висит на строке, а не на коробке кнопки, и только читает.
    Коробка меняет ширину сама — от анимации, — и наблюдение за ней замкнуло
    бы круг «померил → записал → ширина поехала → померил». Строка же своего
    размера от этого не меняет: её ширину задаёт колонка.
  */
  useEffect(() => {
    const row = rowRef.current

    if (row === null) {
      return undefined
    }

    const invalidate = (): void => {
      const { height } = row.getBoundingClientRect()

      if (height > 0) {
        setCompactWidth(height)
      }

      setExpandedWidth(null)
    }

    const observer = new ResizeObserver(invalidate)

    observer.observe(row)

    return () => observer.disconnect()
  }, [])

  /*
    Единственное место, где ширина развёрнутой кнопки меряется. Срабатывает и
    на первом кадре, и после сброса наблюдателем выше.

    Замера может не быть вовсе: страницу открыли с товаром, уже лежащим в
    корзине, и развёрнутой кнопки виджет не видел ни кадра — а первое, что
    делает человек, это убирает товар, и ехать кнопке надо прямо сейчас.
    Поэтому в `useLayoutEffect`, а не в `useEffect`: замер и запись происходят
    до отрисовки, и кадра с развёрнутой кнопкой никто не увидит — иначе она
    мигнула бы во всю строку перед тем, как выехать из круга.
  */
  useLayoutEffect(() => {
    if (isInCart || expandedWidth !== null) {
      return
    }

    const measured = measureExpanded()

    if (measured !== null) {
      setExpandedWidth(measured)
    }
  }, [isInCart, expandedWidth, measureExpanded])

  /*
    Выбранный объём — источник цены и наличия. Товар с одним вариантом
    проходит через ту же ветку: у него выбирать нечего, но вариант есть
    всегда, и отдельного пути для «товара без объёмов» в коде не заводится.
  */
  const selected =
    product.variants.find(variant => variant.id === selectedVariantId) ??
    product.variants[0] ??
    null
  const hasChoice = product.variants.length > 1
  const priceCents = selected?.priceCents ?? product.priceCents
  const inStock = selected?.inStock ?? product.inStock
  // Метка объёма стоит рядом с маркой только тогда, когда он один: иначе объём
  // выбирают, и говорить о нём в справочной строке значит называть неверный.
  const volume = hasChoice ? null : formatVolume(selected?.volumeMl ?? product.volumeMl)

  return (
    <div className={clsx(styles.container, className)}>
      <ProductGallery images={product.images} productName={product.name} />

      <div className={styles.info}>
        {(product.brand !== null ||
          (categoryName !== undefined && categoryName !== null) ||
          volume !== null) && (
          <span className={styles.tags}>
            {/*
              Тон марки, а не нейтральный: справочные метки — единственный
              цветной акцент над заголовком, и в сером они читались как
              служебная подпись, а не как часть карточки товара.
            */}
            {product.brand !== null && <Badge tone="brand">{product.brand}</Badge>}
            {categoryName !== undefined && categoryName !== null && (
              <Badge tone="brand">{categoryName}</Badge>
            )}
            {/* Объём — такая же справочная метка, как марка и категория, и стоит с ними. */}
            {volume !== null && <Badge tone="brand">{volume}</Badge>}
          </span>
        )}

        <Heading level={1} size="lg">
          {product.name}
        </Heading>

        <div className={styles.priceRow}>
          <Price priceCents={priceCents} size="lg" />

          {inStock ? (
            <Badge tone="success" withDot={true}>
              В наличии
            </Badge>
          ) : (
            <Badge tone="neutral" withDot={true}>
              Нет в наличии
            </Badge>
          )}
        </div>

        {hasChoice && onSelectVariant !== undefined && (
          <VariantSelector
            className={styles.variants}
            variants={product.variants}
            selectedId={selected?.id ?? null}
            onSelect={onSelectVariant}
          />
        )}

        {product.description !== null && product.description !== '' && (
          <Text className={styles.description} tone="secondary">
            {product.description}
          </Text>
        )}

        {(quantity !== undefined || action !== undefined || secondaryAction !== undefined) && (
          <div ref={rowRef} className={styles.action}>
            {/*
              Количество — слева от кнопки: справа стоит сердце, и вклинься
              число между двумя действиями, строка читалась бы как три равных
              элемента вместо «сколько — и что с этим сделать».
            */}
            {quantity !== undefined && (
              <AnimatePresence initial={false}>
                {isInCart && (
                  <motion.div
                    ref={quantityRef}
                    className={styles.actionQuantity}
                    initial={isReduced ? false : { width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={isReduced ? { opacity: 0 } : { width: 0, opacity: 0 }}
                    transition={isReduced ? { duration: 0 } : CART_ACTION_TRANSITION}
                  >
                    <div className={styles.actionQuantityInner}>{quantity}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/*
              Главное действие — кнопкой, «в избранное» — круглым сердцем
              рядом: слоты обёрнуты, потому что раскладка у них разная (одно
              меняет ширину, второе держит квадрат), а классы слотам не
              передать.
            */}
            {action !== undefined && (
              <motion.div
                ref={actionRef}
                className={clsx(
                  styles.actionPrimary,
                  /*
                    Растяжение снимается и на время обратного хода: с ним
                    кнопка, которой анимация задала 52px, мгновенно
                    разъехалась бы на всю строку и ехать ей было бы уже
                    некуда.
                  */
                  (isInCart || isMorphing) && styles.actionPrimaryFixed,
                  isInCart && styles.actionPrimaryCompact,
                  isMorphing && styles.actionPrimaryMorphing
                )}
                animate={{ width: isInCart ? compactWidth : (expandedWidth ?? 'auto') }}
                transition={isReduced ? { duration: 0 } : CART_ACTION_TRANSITION}
                onAnimationComplete={() => setIsMorphing(false)}
              >
                {action}
              </motion.div>
            )}

            {secondaryAction !== undefined && (
              <div className={styles.actionSecondary}>{secondaryAction}</div>
            )}
          </div>
        )}

        {/*
          Объяснение под кнопками, а не вместо них: погашенная «в корзину»
          говорит, что нельзя, и ничего — почему.
        */}
        {note !== undefined && <div className={styles.note}>{note}</div>}
      </div>
    </div>
  )
}
