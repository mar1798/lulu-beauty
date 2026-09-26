import { style } from '@vanilla-extract/css'
import { color, rem } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/** Ширина кнопки отправки на десктопе — её же держит и скелетон. */
const SUBMIT_WIDTH = rem(220)

export const form = style({
  ...flexColumn(20),
  /*
    До `sm` отступ меньше: 32px с каждой стороны на экране в 320-375px съедали
    пятую часть ширины, и названия позиций переносились через каждые два слова.
  */
  padding: vars.space.lg,
  backgroundColor: color.surface('base'),
  borderRadius: vars.radius.xxl,
  boxShadow: vars.shadow.md,
  ...media({
    sm: { padding: vars.space.xl },
  }),
})

/** С переносом: «Итого · 2 позиции» и сумма на узком экране в строку не помещаются. */
export const totalRow = style({
  ...flexRow(12),
  alignItems: 'baseline',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
})

/*
  На телефоне и планшете кнопка — во всю ширину: это единственное действие
  экрана, и большая цель для пальца тут уместна. На десктопе карточка шире,
  и растянутая кнопка выглядит непропорционально — ужимаем до фиксированной
  ширины и прижимаем к началу строки.

  Ширина задаётся здесь, а не пропом `isFullWidth`: у обоих правил
  специфичность одного класса, и порядок файлов в собранном CSS решал бы,
  какое победит.
*/
export const submit = style({
  width: '100%',
  ...media({
    lg: {
      width: SUBMIT_WIDTH,
      alignSelf: 'flex-start',
    },
  }),
})

/** Скелетон повторяет ту же ширину, чтобы после загрузки кнопка не прыгнула. */
export const submitSkeleton = style({
  width: '100%',
  ...media({
    lg: { width: SUBMIT_WIDTH },
  }),
})
