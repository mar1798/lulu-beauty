import type { StyleRule } from '@vanilla-extract/css'
import { color, media } from '../lib'
import { vars } from '../themes/contract.css'

/**
 * Белая карточка-панель админки: единственный «лист» на холсте страницы.
 *
 * Отдельный миксин, а не локальная константа в каждом организме, потому что
 * внутренний отступ у панели адаптивный: на телефоне `lg` (24px) с двух сторон
 * съедал бы почти четверть ширины экрана, и календарь сборов переставал
 * помещаться в семь колонок. Держать это правило в четырёх копиях — значит
 * однажды поправить три из них.
 */
export function panel(): StyleRule {
  return {
    padding: vars.space.md,
    backgroundColor: color.surface('base'),
    borderRadius: vars.radius.xxl,
    boxShadow: vars.shadow.md,
    ...media({
      sm: { padding: vars.space.lg },
    }),
  }
}
