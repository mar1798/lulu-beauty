import { globalStyle, style } from '@vanilla-extract/css'
import { font, rem } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'
import { chevron, control } from '../../atoms/select/Select.css'

/*
 * Поле живёт только в строке админской таблицы заявок и там на треть меньше
 * обычного `Select`: в полный рост (44px, шрифт 16px) ячейка статуса забирала
 * себе больше места, чем номер, покупатель и сумма вместе, а вдвое меньшее
 * (22px) оказалось уже мелковато. Шрифт не уменьшается в той же пропорции —
 * ниже 12px названия статусов плохо читаются.
 */
export const container = style({
  /* В строке таблицы поле не должно растягиваться на всю ячейку. */
  minWidth: rem(140),
})

globalStyle(`${container} ${control}`, {
  minHeight: rem(29),
  padding: `${vars.space.xxs} ${vars.space.sm}`,
  paddingRight: rem(32),
  font: font('12/16'),
})

globalStyle(`${container} ${chevron}`, {
  right: vars.space.sm,
  fontSize: rem(12),
})
