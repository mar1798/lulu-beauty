/**
 * Хэллоуинское оформление — временное, и всё, что его включает, собрано здесь.
 *
 * Выключить целиком — `HALLOWEEN_ENABLED = false`: сцены возвращают `null`,
 * ранний скрипт в `_document` не попадает в разметку, атрибут
 * `data-halloween` на `<html>` не ставится, и сайт выглядит ровно как раньше,
 * включая фон, — все глобальные правила декора висят на этом атрибуте.
 *
 * Включённый флаг ещё не значит «показывать»: оформление само гаснет после
 * `HALLOWEEN_UNTIL`. Проверка идёт в браузере, а не на сборке: страницы
 * статические, и собранная до ноября корзина иначе осталась бы в тыквах до
 * следующего релиза.
 */
export const HALLOWEEN_ENABLED = true

/**
 * Первый момент, когда оформления уже нет: 2 ноября включительно по Бишкеку
 * (UTC+6), где живут и магазин, и почти все покупатели.
 */
export const HALLOWEEN_UNTIL = '2026-11-03T00:00:00+06:00'

const UNTIL_MS = Date.parse(HALLOWEEN_UNTIL)

export const isHalloweenSeason = (now: number = Date.now()): boolean =>
  HALLOWEEN_ENABLED && now < UNTIL_MS

/** Атрибут на `<html>`, на котором держатся все глобальные правила декора. */
export const HALLOWEEN_ATTRIBUTE = 'data-halloween'

/**
 * Пауза анимаций декора вне экрана (`Deco`) и у мыши между пролётами. Правило
 * для него — в `halloween.css.ts`.
 */
export const HALLOWEEN_PAUSED_ATTRIBUTE = 'data-halloween-paused'

/** «Сумерки»: холст вместо обычного `#f2f4f5`. Им же красится адресная строка. */
export const HALLOWEEN_CANVAS = '#e3e1e7'

/**
 * Откуда берутся картинки декора (`public/halloween`). Мыши с машущими
 * крыльями здесь нет: она встроенный SVG (`BatFlap.tsx`), потому что внутри
 * `<img>` анимация не играет.
 */
export const HALLOWEEN_ASSETS = {
  pumpkin: '/halloween/pumpkin.svg',
  pumpkinFace: '/halloween/pumpkin-face.svg',
  ghost: '/halloween/ghost.svg',
  bat: '/halloween/bat.svg',
  bats: '/halloween/bats.svg',
  cobweb: '/halloween/cobweb-corner.svg',
  spider: '/halloween/spider.svg',
  candle: '/halloween/candle.svg',
  candlesTrio: '/halloween/candles-trio.svg',
} as const

export type IHalloweenAsset = keyof typeof HALLOWEEN_ASSETS

/**
 * Собственные пропорции картинок (ширина / высота из `viewBox`). Нужны, чтобы
 * у каждого `<img>` были настоящие `width`/`height`: место под картинку
 * известно до её загрузки, и ничего не сдвигается.
 */
export const HALLOWEEN_ASPECT: Record<IHalloweenAsset, number> = {
  pumpkin: 1,
  pumpkinFace: 1,
  ghost: 1,
  bat: 400 / 230,
  bats: 440 / 300,
  cobweb: 1,
  spider: 120 / 370,
  candle: 200 / 400,
  candlesTrio: 340 / 420,
}

/**
 * Пролёт летучей мыши через экран: интервал между пролётами, мс. На витрине
 * чаще — там оформление главное; на остальных страницах реже, чтобы мышь не
 * отвлекала от корзины и заявок.
 */
export const BAT_FLIGHT = {
  catalog: { min: 20_000, max: 30_000 },
  other: { min: 45_000, max: 60_000 },
  /** Сам пролёт. */
  durationMs: 6000,
  /** Первый пролёт — не сразу: сначала человек видит страницу, а не мышь. */
  firstDelayMs: 6000,
} as const
