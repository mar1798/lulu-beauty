import { style } from '@vanilla-extract/css'
import { flexColumn } from 'widgets/styling/mixin'

/**
 * Секция главной: шапка и содержимое.
 *
 * Ритм между самими секциями держит `HomeTemplate` (64px), а этот отступ —
 * внутренний, между заголовком секции и её содержимым. Разводить их важно:
 * иначе «как это работает» прилипает к подборке товаров.
 */
export const section = style(flexColumn(24))
