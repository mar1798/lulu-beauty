import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, panel as panelMixin } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Без `gap`: у свёрнутой секции тело нулевой высоты, и зазор под заголовком остался бы. */
export const panel = style(panelMixin())

export const sectionHeading = style({
  margin: 0,
})

/**
 * Заголовок секции — кнопка на всю ширину панели: свернуть и развернуть можно
 * нажатием в любое место строки, не целясь в шеврон.
 */
export const sectionTrigger = style([
  {
    ...flexRow(12),
    alignItems: 'center',
    width: '100%',
    minHeight: rem(44),
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: color.text('primary'),
  },
  focusVisibleRing(),
])

export const sectionTitle = style({
  font: font('18/28', 600),
})

/** Краткая сводка содержимого — видна и у свёрнутой секции, чтобы не раскрывать её ради проверки. */
export const sectionSummary = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  font: font('14/20'),
  color: color.text('muted'),
})

export const chevron = style({
  flexShrink: 0,
  marginLeft: 'auto',
  fontSize: rem(20),
  color: color.text('muted'),
  transition: transition('transform'),
  ...media({ preferReducedMotion: { transition: 'none' } }),
})

export const chevronOpen = style({
  transform: 'rotate(180deg)',
})

/**
 * Тело секции. Высоту и прозрачность ведёт motion, а видимость — CSS: у
 * свёрнутой секции поля прячутся от Tab и скринридера только после того, как
 * доиграет сворачивание (задержка `visibility`), а при раскрытии становятся
 * доступны сразу — форма фокусирует поле с ошибкой в том же кадре.
 */
export const sectionBody = style({
  overflow: 'hidden',
  visibility: 'visible',
})

export const sectionBodyClosed = style({
  visibility: 'hidden',
  transition: 'visibility 0s linear 0.3s',
  ...media({ preferReducedMotion: { transition: 'none' } }),
})

export const sectionInner = style({
  ...flexColumn(16),
  paddingTop: vars.space.md,
})
