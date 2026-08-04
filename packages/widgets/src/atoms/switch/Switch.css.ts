import { style } from '@vanilla-extract/css'
import { color, font, rem, transition } from '../../styling/lib'
import { flexRow, focusRing, visuallyHidden } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

const TRACK_WIDTH = 44
const TRACK_HEIGHT = 24
const THUMB_SIZE = 18
const THUMB_OFFSET = 3

export const container = style({
  ...flexRow(10),
  alignItems: 'center',
  cursor: 'pointer',
  selectors: {
    '&[data-disabled="true"]': { cursor: 'not-allowed', opacity: 0.6 },
  },
})

export const input = style(visuallyHidden())

export const track = style({
  position: 'relative',
  flexShrink: 0,
  width: rem(TRACK_WIDTH),
  height: rem(TRACK_HEIGHT),
  backgroundColor: color.neutral('300'),
  borderRadius: vars.radius.pill,
  transition: transition('background-color'),
  selectors: {
    [`${input}:checked + &`]: { backgroundColor: color.brand('600') },
    [`${input}:focus-visible + &`]: focusRing(),
  },
})

export const thumb = style({
  position: 'absolute',
  top: rem(THUMB_OFFSET),
  left: rem(THUMB_OFFSET),
  width: rem(THUMB_SIZE),
  height: rem(THUMB_SIZE),
  backgroundColor: color.neutral('0'),
  borderRadius: vars.radius.circle,
  boxShadow: vars.shadow.xs,
  transition: transition('transform'),
  selectors: {
    [`${input}:checked + ${track} > &`]: {
      transform: `translateX(${rem(TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET * 2)})`,
    },
  },
})

export const label = style({
  font: font('15/22'),
  color: color.text('primary'),
})
