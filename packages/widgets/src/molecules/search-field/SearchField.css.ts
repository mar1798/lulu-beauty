import { style } from '@vanilla-extract/css'
import { calc } from '@vanilla-extract/css-utils'
import { media, rem } from '../../styling/lib'
import { vars } from '../../styling/themes/contract.css'

/**
 * До `md` поле тянется во всю ширину: там оно стоит в столбец с фильтрами, и
 * потолок в 420px делал его уже соседних селектов — три контрола одного
 * назначения читались как разные. С `md` поиск встаёт с ними в строку, и
 * потолок возвращается, чтобы он не съедал её целиком.
 */
export const container = style({
  width: '100%',
  ...media({
    md: { maxWidth: rem(420) },
  }),
})

export const icon = style({
  fontSize: rem(18),
})

/** Кнопка очистки подтянута к правому краю поля. */
export const clear = style({
  marginRight: calc(vars.space.xs).negate().toString(),
})
