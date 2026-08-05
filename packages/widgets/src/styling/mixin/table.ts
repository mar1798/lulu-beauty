import type { CSSProperties, StyleRule } from '@vanilla-extract/css'
import { border, color, font, rem } from '../lib'
import { vars } from '../themes/contract.css'

/**
 * Табличная внешность админки. Вынесено в миксин: таблиц две (товары и
 * заявки), обе живут в одной сетке отступов и одних волосяных линиях, а
 * наследовать стили между организмами нечем.
 *
 * Строится на настоящих `<table>`, а не на гриде из `div`: у таблицы есть
 * заголовки колонок, и скринридер объявляет их вместе с ячейкой — из грида
 * эта связь пропадает, и «PENDING» перестаёт быть «статусом».
 */

/**
 * Обёртка с горизонтальной прокруткой. Таблица на телефоне не переносится и
 * не сжимается — она прокручивается, иначе колонки схлопываются в кашу.
 */
export function tableWrap(): CSSProperties {
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

export function tableHeadCell(): CSSProperties {
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

export function tableCell(): CSSProperties {
  return {
    padding: `${vars.space.sm} ${vars.space.md}`,
    font: font('14/20'),
    color: color.text('primary'),
    borderBottom: border(1, color.border('subtle')),
    verticalAlign: 'middle',
  }
}

/** Ячейка с кнопками действий: прижата вправо и не переносится. */
export function tableActionsCell(): CSSProperties {
  return {
    ...tableCell(),
    width: rem(1),
    whiteSpace: 'nowrap',
    textAlign: 'right',
  }
}
