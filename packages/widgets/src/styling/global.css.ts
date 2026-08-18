/* esl1t-disable @typescript-eslint/no-magic-numbers */
import { createGlobalTheme, globalStyle } from '@vanilla-extract/css'
import { color, font, fontFamily, important, min, rem } from './lib'
import { vars } from './themes/contract.css'
import { flexColumn } from './mixin'
import { lightTheme } from './themes/light.css'
import {
  animateVar,
  trnDelayVar,
  trnEasingVar,
  wrapperPadding,
  wrapperWidth,
} from './properties.css'
import { calc } from '@vanilla-extract/css-utils'

createGlobalTheme(':root', vars, lightTheme)

globalStyle(':root', {
  fontFamily: fontFamily('inter'),
  /** Отрицательный трекинг по умолчанию — базовая подпись макета. */
  letterSpacing: vars.tracking.body,
  vars: {
    [trnEasingVar]: 'ease-in-out',
    [trnDelayVar]: '0.22s',
    [animateVar]: '0',
    [wrapperWidth]: min(calc('100vw').subtract(rem(40)), rem(1200)),
    [wrapperPadding]: calc('100vw').subtract(wrapperWidth).divide(2).toString(),
  },
})

globalStyle('input:focus, textarea:focus, select:focus', {
  outline: 'none',
})

globalStyle('input::placeholder,select::placeholder,textarea::placeholder,.placeholder', {
  color: color.text('muted'),
})

/**
 * Страница не ездит вбок ни при каких обстоятельствах.
 *
 * Всплывающее (подсказка над кнопкой в карточке, у правой колонки каталога и
 * избранного) вылезает за правый край экрана — и, хотя бокс у него абсолютный,
 * область прокрутки документа он всё равно растягивает. Полосы прокрутки по
 * всему сайту спрятаны (см. ниже), поэтому наружу это выходило не полосой, а
 * прыжком всей страницы вбок на первом же тапе. На главной этого не было
 * только потому, что там всё лежит внутри секций со своей обрезкой.
 *
 * `clip`, а не `hidden`: `hidden` сделал бы корень контейнером прокрутки и
 * сломал бы `position: sticky` у шапки и плавную прокрутку по якорям. `clip`
 * же просто обрезает — прокрутки не создаёт. Обрезать текст подсказок ему при
 * этом не приходится: их отодвигает от края сам `Tooltip`.
 */
globalStyle('html', {
  overflowX: 'clip',
})

globalStyle('html, body', {
  backgroundColor: color.background('page'),
  color: color.text('primary'),
  minHeight: '100vh',
  scrollBehavior: 'smooth',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
})

/*
  Полосы прокрутки скрыты по всему сайту — не только у страницы, но и у всего,
  что прокручивается внутри неё: списка в `Select`, таблиц админки, полосы
  разделов на телефоне.

  Именно `*`, а не `html, body`: `scrollbar-width` не наследуется, и правило на
  корне не доходит ни до одного вложенного контейнера. Оба объявления
  обязательны — `scrollbar-width` понимают Firefox и свежие WebKit/Chromium,
  `::-webkit-scrollbar` закрывает всё остальное; раньше стояло только первое, и
  в Chrome полосы никуда не девались.

  Прокрутка при этом остаётся: скрыт только сам ползунок, колесо, тачпад,
  клавиши и `scroll-behavior` работают как прежде.
*/
globalStyle('*', {
  scrollbarWidth: 'none',
})

globalStyle('*::-webkit-scrollbar', {
  display: 'none',
})

globalStyle('img', {
  font: font('16/16', 500),
  letterSpacing: 0,
})

globalStyle('[class*="_disabled"], [disabled], .disabled', {
  cursor: important('not-allowed'),
})

globalStyle('#__next', {
  ...flexColumn(),
  minHeight: '100vh',
})

globalStyle('.grecaptcha-badge', {
  visibility: 'hidden',
})

globalStyle('[id]', {
  scrollMarginTop: rem(96),
})
