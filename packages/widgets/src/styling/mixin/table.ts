import type { StyleRule } from '@vanilla-extract/css'
import { border, color, font, media, rem } from '../lib'
import { vars } from '../themes/contract.css'

/**
 * Табличная внешность админки. Вынесено в миксин: таблиц три (товары, заявки
 * и ошибки импорта), все живут в одной сетке отступов и одних волосяных
 * линиях, а наследовать стили между организмами нечем.
 *
 * Строится на настоящих `<table>`, а не на гриде из `div`: у таблицы есть
 * заголовки колонок, и скринридер объявляет их вместе с ячейкой — из грида
 * эта связь пропадает, и «PENDING» перестаёт быть «статусом».
 *
 * Миксины делятся на две группы. Первая (`tableWrap`, `tableBase`,
 * `tableCell`, …) — обычная таблица на любой ширине; ею живут ошибки импорта:
 * там две колонки, они помещаются даже на телефоне. Вторая (`tableCard*`) —
 * надстройка для широких таблиц товаров и заявок: ниже `md` они разбираются в
 * карточки. Каждая функция второй группы **включает в себя** соответствующую
 * из первой, поэтому применяется одна, а не пара, — композиция `style([a, b])`
 * в vanilla-extract разрешает конфликты порядком в стилевом файле, и полагаться
 * на него в перекрытиях не стоит.
 */

/** Обёртка-панель с горизонтальной прокруткой для таблицы, которая не влезает. */
export function tableWrap(): StyleRule {
  return {
    width: '100%',
    overflowX: 'auto',
    backgroundColor: color.surface('base'),
    borderRadius: vars.radius.xxl,
    boxShadow: vars.shadow.md,
  }
}

export function tableBase(): StyleRule {
  return {
    width: '100%',
    minWidth: rem(720),
    borderCollapse: 'collapse',
    textAlign: 'left',
  }
}

export function tableHeadCell(): StyleRule {
  return {
    padding: `${vars.space.sm} ${vars.space.md}`,
    font: font('12/18', 600),
    letterSpacing: vars.tracking.wide,
    textTransform: 'uppercase',
    color: color.text('muted'),
    whiteSpace: 'nowrap',
    borderBottom: border(1, color.border('subtle')),
  }
}

export function tableCell(): StyleRule {
  return {
    padding: `${vars.space.sm} ${vars.space.md}`,
    font: font('14/20'),
    color: color.text('primary'),
    borderBottom: border(1, color.border('subtle')),
    verticalAlign: 'middle',
  }
}

/** Ячейка с кнопками действий: прижата вправо и не переносится. */
export function tableActionsCell(): StyleRule {
  return {
    ...tableCell(),
    width: rem(1),
    whiteSpace: 'nowrap',
    textAlign: 'right',
  }
}

/**
 * Карточный режим: ниже `md` таблица перестаёт быть таблицей.
 *
 * Горизонтальной прокрутки на телефоне мало. В таблице товаров пять колонок
 * при минимальной ширине 720px — на экране 390px помещалась одна первая, а
 * «Изменить» и «Удалить» уезжали за край, где их никто не искал. Поэтому
 * строка становится карточкой, шапка прячется, а название колонки
 * подставляется в ячейку из атрибута `data-label`.
 *
 * Ролевая семантика восстанавливается вручную: `display: block` снимает с
 * элементов таблицы их встроенные роли, поэтому в разметке обеих таблиц
 * проставлены явные `role="table" / "rowgroup" / "row" / "cell"` — без них на
 * телефоне строка перестала бы объявляться строкой.
 */

export function tableCardBase(): StyleRule {
  return {
    ...tableBase(),
    display: 'block',
    minWidth: 0,
    /* Поля карточек: горизонтального отступа у ячеек в этом режиме нет. */
    paddingInline: vars.space.md,
    ...media({
      md: { display: 'table', minWidth: rem(720), paddingInline: 0 },
    }),
  }
}

/** Шапку заменяют подписи из `data-label`. */
export function tableCardHead(): StyleRule {
  return {
    display: 'none',
    ...media({
      md: { display: 'table-header-group' },
    }),
  }
}

export function tableCardBody(): StyleRule {
  return {
    display: 'block',
    ...media({
      md: { display: 'table-row-group' },
    }),
  }
}

/** Строка: на телефоне — карточка с волосяной линией снизу, на широком — `tr`. */
export function tableCardRow(): StyleRule {
  return {
    display: 'flex',
    flexDirection: 'column',
    rowGap: vars.space.xs,
    paddingBlock: vars.space.md,
    borderBottom: border(1, color.border('subtle')),
    selectors: {
      '&:last-child': { borderBottom: 'none' },
    },
    ...media({
      md: { display: 'table-row', paddingBlock: 0, borderBottom: 'none' },
    }),
  }
}

/**
 * То, что возвращает ячейке табличность от `md` и вверх. Отдельная функция,
 * потому что `media()` собирает объект `{ '@media': … }` целиком: два вызова
 * подряд в одном правиле затирали бы друг друга, а ячейке действий нужны и
 * эти правила, и свои.
 */
function cellAtTableWidth(extra: StyleRule = {}): StyleRule {
  return {
    display: 'table-cell',
    padding: `${vars.space.sm} ${vars.space.md}`,
    borderBottom: border(1, color.border('subtle')),
    selectors: {
      '&[data-label]::before': { content: 'none' },
    },
    ...extra,
  }
}

/**
 * Ячейка. На карточке — строка «подпись → значение», где подпись берётся из
 * `data-label`; ячейки без этого атрибута (главная — с названием товара или
 * номером заявки) занимают всю ширину без подписи.
 */
export function tableCardCell(): StyleRule {
  return {
    ...tableCell(),
    display: 'flex',
    columnGap: vars.space.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 0,
    borderBottom: 'none',
    selectors: {
      '&[data-label]::before': {
        content: 'attr(data-label)',
        flexShrink: 0,
        font: font('12/18', 600),
        letterSpacing: vars.tracking.wide,
        textTransform: 'uppercase',
        color: color.text('muted'),
      },
    },
    ...media({ md: cellAtTableWidth() }),
  }
}

/**
 * Ячейка с контролом (селект статуса): на карточке подпись встаёт **над**
 * значением, иначе селект сжимается до нечитаемого.
 */
export function tableCardStackCell(): StyleRule {
  return {
    ...tableCardCell(),
    flexDirection: 'column',
    alignItems: 'stretch',
    rowGap: vars.space.xxs,
  }
}

/** Ячейка с кнопками: в настоящей таблице прижата вправо, на карточке — строка. */
export function tableCardActionsCell(): StyleRule {
  return {
    ...tableCardCell(),
    ...media({
      md: cellAtTableWidth({ width: rem(1), whiteSpace: 'nowrap', textAlign: 'right' }),
    }),
  }
}
