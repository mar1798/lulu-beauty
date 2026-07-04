/* esl1t-disable @typescript-eslint/no-magic-numbers */
import { createGlobalTheme, globalStyle } from '@vanilla-extract/css'
import { font, fontFamily, important, min, rem } from './lib'
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
  vars: {
    [trnEasingVar]: 'ease-in-out',
    [trnDelayVar]: '0.22s',
    [animateVar]: '0',
    [wrapperWidth]: min(calc('100vw').subtract(rem(40)), rem(1128)),
    [wrapperPadding]: calc('100vw').subtract(wrapperWidth).divide(2).toString(),
  },
})

globalStyle('input:focus, textarea:focus, select:focus', {
  outline: 'none',
})

globalStyle('input::placeholder,select::placeholder,textarea::placeholder,.placeholder', {
  color: '',
})

globalStyle('html, body', {
  minHeight: '100vh',
  scrollBehavior: 'smooth',
  scrollbarWidth: 'none',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
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
