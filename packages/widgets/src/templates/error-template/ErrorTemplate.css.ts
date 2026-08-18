import { style } from '@vanilla-extract/css'
import { color, media, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * `minHeight` рядом с `flex: 1` не избыточен: `main` у `BaseLayout` растянут,
 * но сам флекс-контейнером не является, и одного `flex: 1` для вертикального
 * центрирования не хватает.
 */
export const container = style({
  ...flexColumn(0),
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  minHeight: '60vh',
  paddingBlock: vars.space.xxl,
  paddingInline: vars.space.md,
})

export const card = style({
  ...flexColumn(20),
  alignItems: 'center',
  textAlign: 'center',
  width: '100%',
  maxWidth: rem(480),
  padding: vars.space.xl,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
})

/**
 * Код — единственная крупная цифра на экране, поэтому он взят марочным
 * цветом и стянут трекингом, как остальная крупная типографика темы.
 */
export const code = style({
  fontFamily: vars.font.eloqua,
  /*
    Вес задан явно. Без него цифра наследовала 400 от `body` — единственное
    место во всём интерфейсе, где дисплейный шрифт шёл не 600-м, и ровно из-за
    него в сборку тянулось (и предзагружалось на каждой странице) лишнее
    начертание. Заодно строчка выше про «как остальная крупная типографика
    темы» стала правдой.
  */
  fontWeight: 600,
  fontSize: rem(64),
  lineHeight: 1,
  letterSpacing: vars.tracking.tight,
  color: color.text('brand'),
})

export const head = style({
  ...flexColumn(8),
  alignItems: 'center',
})

/*
  На телефоне строка действий растянута по карточке, чтобы кнопкам с
  `isFullWidth="mobile"` было что заполнять; с `sm` — снова по содержимому,
  по центру.
*/
export const actions = style({
  ...flexRow(12),
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignSelf: 'stretch',
  ...media({
    sm: { alignSelf: 'center' },
  }),
})

export const details = style({
  width: '100%',
  paddingTop: vars.space.md,
  borderTop: `1px solid ${color.border('subtle')}`,
})
