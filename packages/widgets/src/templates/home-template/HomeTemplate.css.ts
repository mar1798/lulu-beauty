import { style } from '@vanilla-extract/css'
import { flexColumn } from '../../styling/mixin'

/**
 * Вертикальный поток full-bleed секций. Без `gap` и без верхнего паддинга:
 * герой обязан начинаться от края экрана, а ритм `huge`/`giant` между
 * секциями складывается из их собственных отступов (`HomeSection`).
 */
export const container = style(flexColumn())
