import { style, styleVariants } from '@vanilla-extract/css'
import { border, color, font, rem } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexRow(12),
  alignItems: 'flex-start',
  padding: `${vars.space.sm} ${vars.space.md}`,
  border: border(1, 'transparent'),
  borderRadius: vars.radius.md,
})

export const tone = styleVariants({
  info: {
    backgroundColor: color.info('100'),
    borderColor: color.info('300'),
    color: color.info('700'),
  },
  success: {
    backgroundColor: color.success('100'),
    borderColor: color.success('300'),
    color: color.success('700'),
  },
  warning: {
    backgroundColor: color.warning('100'),
    borderColor: color.warning('300'),
    color: color.warning('700'),
  },
  danger: {
    backgroundColor: color.danger('100'),
    borderColor: color.danger('300'),
    color: color.danger('700'),
  },
})

export const body = style(flexColumn(4))

export const title = style({
  font: font('15/22', 600),
})

export const message = style({
  font: font('14/20'),
})

export const close = style({
  marginLeft: 'auto',
  marginTop: rem(-4),
  marginRight: rem(-8),
  color: 'inherit',
})
