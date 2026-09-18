import { style } from '@vanilla-extract/css'
import { border, color, media } from '../../styling/lib'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(12),
  padding: vars.space.md,
  backgroundColor: color.surface('sunken'),
  borderRadius: vars.radius.xl,
})

/**
 * Выдача лежит белой карточкой на утопленной панели подборщика — той же
 * подложкой, что карточки в сетке каталога. Не для украшения: на самой панели
 * (`#f2f4f5`) скелетону не из чего быть видимым, и полоска, которой хватает
 * контраста, читается уже не как заглушка, а как серое полотно. На белом
 * скелетон берёт ту же розовую пульсацию, что и сетка, а выдача совпадает с
 * ним геометрией — при подмене меняются только полоски на строки.
 */
export const list = style({
  ...flexColumn(0),
  paddingInline: vars.space.sm,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xl,
  boxShadow: vars.shadow.sm,
})

/**
 * Строка результата — компактнее позиции заявки (миниатюра 48 против 64):
 * это подсказка поиска, а не содержимое заявки, и перевешивать сам состав
 * она не должна.
 */
export const row = style({
  ...flexRow(12),
  alignItems: 'center',
  paddingBlock: vars.space.sm,
  selectors: {
    '&:not(:last-child)': {
      borderBottom: border(1, color.border('subtle')),
    },
  },
})

export const thumb = style({
  position: 'relative',
  flexShrink: 0,
  width: '48px',
  aspectRatio: '4 / 5',
  overflow: 'hidden',
  borderRadius: vars.radius.md,
})

export const placeholder = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.text('subtle'),
})

export const body = style({
  ...flexColumn(4),
  flex: 1,
  minWidth: 0,
})

export const meta = style({
  ...flexRow(8),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/**
 * Скелетон повторяет геометрию строки: миниатюра, две подписи и кнопка
 * добавления — иначе на подмене данными блок поиска подпрыгивал бы. Отсюда и
 * высота строки: 48px миниатюры при 4/5 дают 60px, с отбивками — ровно те же
 * 84px, что у строки выдачи.
 *
 * Ширина миниатюры задаётся пропом `width` (см. `ProductPicker.tsx`): у
 * `Skeleton` она инлайновая и класс бы всё равно не пережила.
 */
export const skeletonThumb = style({
  flexShrink: 0,
  aspectRatio: '4 / 5',
})

export const skeletonLines = style({
  ...flexColumn(8),
  flex: 1,
  minWidth: 0,
})

/**
 * Две формы кнопки добавления в строке результата: круглая с плюсом до `sm`,
 * со словом — дальше. Переключаются подложками, а не классом на самой кнопке:
 * у той есть собственный `display`, и спор двух правил зависел бы от порядка
 * файлов в бандле.
 */
export const addCompact = style({
  display: 'inline-flex',
  flexShrink: 0,
  ...media({
    sm: { display: 'none' },
  }),
})

export const addWide = style({
  display: 'none',
  flexShrink: 0,
  ...media({
    sm: { display: 'inline-flex' },
  }),
})
