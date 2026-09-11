import { style } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../../styling/lib'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow, focusVisibleRing, panel, visuallyHidden } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

export const container = style({
  ...flexColumn(20),
  ...media({
    lg: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)',
      gap: vars.space.lg,
      alignItems: 'start',
    },
  }),
})

/**
 * Ошибка занимает обе колонки. Без этого она вставала первой ячейкой сетки и
 * сдвигала календарь в узкую правую колонку, а редактор — в широкую левую.
 */
export const alertSlot = style({
  ...media({
    lg: { gridColumn: '1 / -1' },
  }),
})

export const calendar = style({
  ...flexColumn(16),
  ...panel(),
})

export const head = style({
  ...flexRow(8),
  alignItems: 'center',
  justifyContent: 'space-between',
})

/**
 * Семь колонок при любой ширине: неделя есть неделя. Зазор на телефоне уже —
 * при 6px клетка на экране 320px не набирала места даже под двузначное число.
 */
const weekGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: rem(3),
  ...media({
    sm: { gap: rem(6) },
  }),
} as const

export const weekdays = style(weekGrid)

export const weekday = style({
  font: font('11/16', 600),
  letterSpacing: vars.tracking.wide,
  textTransform: 'uppercase',
  color: color.text('muted'),
  textAlign: 'center',
  ...media({
    sm: { font: font('12/18', 600) },
  }),
})

export const grid = style(weekGrid)

export const blank = style({})

export const day = style([
  {
    ...flexColumn(4),
    alignItems: 'center',
    justifyContent: 'flex-start',
    /* Квадрат по ширине колонки — на телефоне высота в 72px была бы башней. */
    aspectRatio: '1 / 1',
    padding: rem(4),
    backgroundColor: color.surface('muted'),
    border: border(1, 'transparent'),
    borderRadius: vars.radius.md,
    cursor: 'pointer',
    transition: transition('background-color', 'border-color'),
    selectors: {
      '&:hover': { backgroundColor: color.surface('soft') },
    },
    ...media({
      sm: { aspectRatio: 'auto', minHeight: rem(72), padding: rem(6) },
    }),
  },
  focusVisibleRing(),
])

/**
 * Прошедший день приглушён, но кликабелен: назначить на него сбор бэкенд не
 * даст (`deadline_must_be_future`), а открыть и посмотреть прошлый — можно.
 *
 * Подложка — нейтральный 300, а не `surface('sunken')`: тот отличался от
 * обычной клетки (`surface('muted')`) на один шаг шкалы, `#f2f4f5` против
 * `#f8f9fa`, и в сетке из тридцати клеток граница «сегодня» просто не
 * читалась. Разница в две ступени видна сразу.
 *
 * Приглушается подложка и число, а не весь день через `opacity`: прозрачность
 * смешивала с фоном и текст бейджа со временем, роняя контраст до 3.13:1
 * (поймано axe на живой странице).
 */
export const dayPast = style({
  backgroundColor: color.neutral('300'),
})

export const dayToday = style({
  borderColor: color.border('strong'),
})

export const daySelected = style({
  backgroundColor: color.surface('soft'),
  borderColor: color.border('focus'),
})

export const dayNumber = style({
  font: font('13/18', 600),
  color: color.text('primary'),
  fontVariantNumeric: 'tabular-nums',
  ...media({
    sm: { font: font('14/20', 600) },
  }),
})

/**
 * Число прошедшего дня: нейтральный 700, а не `text('muted')`. На потемневшей
 * подложке muted (`#6f6c6b` на `#e0e0e0`) даёт 3.94:1 — ниже WCAG AA 4.5:1 для
 * мелкого текста; 700 выходит на 6.6:1 и остаётся заметно светлее чернильного
 * числа обычного дня.
 */
export const dayNumberPast = style({
  color: color.neutral('700'),
})

/**
 * Метки сборов на клетке. До `sm` это точки: бейдж «20:00» требует ~45px, а
 * клетка на экране 390px — около 40px, и время вылезало на соседний день.
 * Время в этом случае читается в редакторе под календарём.
 */
export const dayDots = style({
  ...flexRow(3),
  flexWrap: 'wrap',
  justifyContent: 'center',
  ...media({
    sm: { display: 'none' },
  }),
})

export const dot = style({
  width: rem(5),
  height: rem(5),
  borderRadius: vars.radius.pill,
  /* Не `border('strong')`: на приглушённой подложке прошедшего дня точка терялась. */
  backgroundColor: color.text('muted'),
})

export const dotActive = style({
  backgroundColor: color.brand('600'),
})

export const dayTimes = style({
  display: 'none',
  ...media({
    sm: { ...flexColumn(4), maxWidth: '100%' },
  }),
})

export const dayCycle = style({
  display: 'block',
  maxWidth: '100%',
})

/** Время дедлайна для скринридера: обе видимые метки от него скрыты. */
export const dayLabel = style(visuallyHidden())

export const editor = style({
  ...flexColumn(12),
  ...panel(),
  alignItems: 'stretch',
})

export const statusRow = style({
  ...flexColumn(6),
})

/**
 * Прошедший сбор в редакторе: пары «подпись — значение» вместо полей ввода.
 * Тот же вертикальный ритм, что у `Input`, чтобы карточка не подпрыгивала при
 * переходе с идущего сбора на прошедший.
 */
export const facts = style({
  ...flexColumn(12),
  margin: 0,
})

export const fact = style({
  ...flexColumn(2),
})

export const factLabel = style({
  font: font('13/18', 600),
  color: color.text('secondary'),
})

export const factValue = style({
  margin: 0,
  font: font('15/22'),
  color: color.text('primary'),
})

/**
 * Действия — столбиком во всю ширину карточки, а не строкой с переносом:
 * подписи у них разной длины («Сохранить», «Закрыть сейчас», «Удалить»), и в
 * узкой правой колонке они переносились вразнобой — то две в строке, то одна.
 */
export const editorActions = style({
  ...flexColumn(8),
  alignItems: 'stretch',
})
