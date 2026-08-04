import { style } from '@vanilla-extract/css'

/**
 * Обёртка приложения, на которой висят классы шрифтов.
 *
 * Это `div`, а не `main`: собственный `<main>` рисует `BaseLayout`, а два
 * `<main>` на странице — невалидная разметка и сломанный ориентир для
 * скринридера. Растягивается на всю высоту, чтобы подвал прижимался к низу
 * (`#__next` уже колонка во всю высоту — см. `global.css.ts` в `widgets`).
 */
export const shell = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
})
