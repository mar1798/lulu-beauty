/* eslint-disable @next/next/no-img-element */
// Компоненты новогоднего декора. Без эффектов и таймеров: условный рендер по `useNewYear()`
// (на сервере и при гидрации `false`, после неё - атрибут `data-newyear` на <html>, который
// выставил ранний скрипт; сезон фиксируется на момент загрузки страницы).
// Анимация есть только у гирлянды, снегопада, подарков и носка (CSS keyframes внутри SVG,
// при prefers-reduced-motion замирают на месте). Остальное - статичные SVG.
import React from 'react'
import { useNewYear } from './useNewYear'

const BASE = '/seasonal/newyear'

export type DecorName =
  | 'tree'
  | 'gift-box'
  | 'gift-box-blush'
  | 'stocking'
  | 'santa-hat'
  | 'snowflake'
  | 'snowflake-white'
  | 'candy-cane'

/** Эти иллюстрации есть только в анимированном виде (папка animated/). */
const ANIMATED: ReadonlySet<DecorName> = new Set(['gift-box', 'gift-box-blush', 'stocking'])

interface INewYearOnlyProps {
  children: React.ReactNode
}

/** Обёртка: рендерит детей только в новогоднее окно. */
export const NewYearOnly = ({ children }: INewYearOnlyProps): React.ReactElement | null => {
  return useNewYear() ? <>{children}</> : null
}

/** Анимированная гирлянда под хедером. Родитель (header) должен иметь position: relative. */
export const HeaderGarland = (): React.ReactElement | null => {
  if (!useNewYear()) return null
  return <div className="ny-garland" aria-hidden="true" />
}

interface ISnowfallProps {
  tone?: 'pink' | 'white'
}

/** Анимированный снегопад. Кладётся внутрь блока с position: relative (hero, Telegram-блок). */
export const Snowfall = ({ tone = 'pink' }: ISnowfallProps): React.ReactElement | null => {
  if (!useNewYear()) return null
  return <div className={`ny-snowfall ny-snowfall--${tone}`} aria-hidden="true" />
}

/**
 * Шапочка бывает не на всех карточках, а на каждой шестой, начиная с первой (every = 6:
 * карточки 1, 7, 13, 19…). Решение зависит только от порядкового номера карточки в выдаче, поэтому:
 * - картинка одинаковая при каждом рендере (без случайности и без мерцания при гидрации);
 * - в сетке на 4 колонки шапочки не стоят друг под другом (0, 6, 12, 18 → колонки 1, 3, 1, 3,
 *   через ряд), в сетке на 2 колонки - в первой колонке каждого третьего ряда.
 * При пагинации/догрузке передавайте сквозной индекс, а не индекс внутри страницы.
 */
export function hasCardHat(index: number, every = 6): boolean {
  return index % every === 0
}

/** Шапочка 24 px на иконке корзины в хедере (слот `cartDecor`). Вне окна не рендерит ничего. */
export const CartHat = (): React.ReactElement | null => {
  if (!useNewYear()) return null
  return (
    <img
      className="ny-cart-hat"
      src={`${BASE}/static/santa-hat.svg`}
      alt=""
      aria-hidden="true"
      width={24}
      height={19}
      decoding="async"
    />
  )
}

interface ICardHatProps {
  index: number
  every?: number
}

/** Шапочка на карточку товара (статичная). Карточка: position: relative и overflow: visible. */
export const CardHat = ({ index, every = 6 }: ICardHatProps): React.ReactElement | null => {
  const active = useNewYear()
  if (!active || !hasCardHat(index, every)) return null
  return (
    <img
      className="ny-card-hat"
      src={`${BASE}/static/santa-hat.svg`}
      alt=""
      aria-hidden="true"
      width={72}
      height={57}
      loading="lazy"
      decoding="async"
    />
  )
}

/**
 * Снег на всю страницу (каталог). Слой `position: fixed` на весь экран за содержимым
 * (`z-index: -1`): снег идёт по фону страницы и не ложится на фото, текст и кнопки - у карточек,
 * шапки и полей свой фон. Места в потоке слой не занимает, поэтому появление после гидрации
 * раскладку не двигает и резерва в серверном HTML не требует. Снег внутри обёртки, а не сам
 * фиксированный блок: правило `.ny-snowfall ~ *` иначе задело бы соседей по странице.
 */
export const PageSnowfall = (): React.ReactElement | null => {
  if (!useNewYear()) return null
  return (
    <div className="ny-page-snow" aria-hidden="true">
      <div className="ny-snowfall ny-snowfall--pink" />
    </div>
  )
}

/**
 * Три носка у заголовка корзины (слот `CartTemplate.titleDecor`): средний чуть меньше, чтобы
 * ряд не читался как штамп. Обёртка только в сезон: вне его слот пуст и скрыт (`:empty`).
 */
export const CartStockings = (): React.ReactElement => (
  <NewYearOnly>
    <span className="ny-cart-stockings">
      <Decor name="stocking" size={40} />
      <Decor name="stocking" size={34} />
      <Decor name="stocking" size={40} />
    </span>
  </NewYearOnly>
)

interface ICartTreeProps {
  /**
   * `head` - в слой `CartTemplate.decor`, справа у блока заголовка (абсолют, с `lg`).
   * `below` - в потоке под панелью корзины или оформления, по центру (до `lg`).
   */
  placement: 'head' | 'below'
  /** Отступ 24 px сверху - когда родитель сам зазора не даёт (`sessionArea` корзины). */
  hasGap?: boolean
}

/**
 * Ёлка с подарками у неё в ногах. Два места под одну картинку: на широком экране справа у
 * заголовка, на узком - под панелью, где у заголовка для неё нет места. Показ по ширине и
 * положение - в `newyear.css`, так что на любом экране видна ровно одна.
 */
export const CartTree = ({ placement, hasGap = false }: ICartTreeProps): React.ReactElement => (
  <NewYearOnly>
    <div
      className={`ny-cart-tree ny-cart-tree--${placement}${hasGap ? ' ny-cart-tree--gap' : ''}`}
      aria-hidden="true"
    >
      <Decor
        name="gift-box-blush"
        size={34}
        className="ny-cart-tree__gift ny-cart-tree__gift--left"
      />
      <Decor name="tree" size={96} />
      <Decor name="gift-box" size={44} className="ny-cart-tree__gift ny-cart-tree__gift--front" />
      <Decor name="gift-box-blush" size={28} className="ny-cart-tree__gift" />
    </div>
  </NewYearOnly>
)

interface IDecorProps {
  name: DecorName
  size?: number
  className?: string
}

/** Натуральные размеры SVG (width x height из корня файла): по ним считается ширина до загрузки. */
const NATURAL_SIZE: Record<DecorName, readonly [number, number]> = {
  tree: [160, 200],
  'gift-box': [160, 170],
  'gift-box-blush': [160, 170],
  stocking: [130, 180],
  'santa-hat': [142, 112],
  snowflake: [100, 100],
  'snowflake-white': [100, 100],
  'candy-cane': [80, 160],
}

/**
 * Декоративная иллюстрация для секций и пустых состояний.
 * Подарки и носок существуют только в анимированном виде, остальное - только статичное.
 */
export const Decor = ({
  name,
  size = 120,
  className = '',
}: IDecorProps): React.ReactElement | null => {
  if (!useNewYear()) return null
  const folder = ANIMATED.has(name) ? 'animated' : 'static'
  const [naturalWidth, naturalHeight] = NATURAL_SIZE[name]
  return (
    <img
      className={`ny-decor ${className}`}
      src={`${BASE}/${folder}/${name}.svg`}
      alt=""
      aria-hidden="true"
      // Атрибуты дают aspect-ratio: до загрузки файла ширина не 0, и сдвига раскладки нет.
      width={Math.round((size * naturalWidth) / naturalHeight)}
      height={size}
      loading="lazy"
      decoding="async"
      // Высота из пропа побеждает `height: auto` из preflight; ширина идёт за ней по
      // aspect-ratio из атрибутов width/height (и до загрузки файла); `max-height` классов
      // уменьшает картинку пропорционально.
      style={{ height: size, width: 'auto', maxWidth: 'none' }}
    />
  )
}
