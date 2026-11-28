import {
  BISHKEK_OFFSET_MIN,
  getDecorMode,
  getDecorWindow,
  NEWYEAR_ATTRIBUTE,
  type DecorMode,
} from './season'

/**
 * Собирает текст скрипта из уже разобранных значений. Принимает их аргументами,
 * чтобы тест мог прогнать любой режим и любое окно.
 *
 * Логика окна повторяет `isNewYearActive` из `season.ts`; расхождение ловит
 * `earlyScript.test.ts`, который сверяет оба по сетке дат.
 */
export const buildNewYearEarlyScript = (mode: DecorMode, start: number, end: number): string =>
  `(function(){try{
var a=${mode === 'on'};
if(${mode === 'auto'}){
var l=new Date(Date.now()+${BISHKEK_OFFSET_MIN * 60_000}),t=(l.getUTCMonth()+1)*100+l.getUTCDate();
a=${start}<=${end}?t>=${start}&&t<=${end}:t>=${start}||t<=${end};
}
if(a)document.documentElement.setAttribute('${NEWYEAR_ATTRIBUTE}','');
}catch(e){}})();`

/**
 * Ставит `data-newyear` на `<html>` до первой отрисовки, если по часам браузера
 * сейчас новогоднее окно. Встраивается в `_document`.
 *
 * Скрипт, а не класс из React: страницы статические, и серверная проверка даты
 * застыла бы на моменте сборки. Режим и даты вшиты при сборке (`env` в
 * `next.config.js`), текущее время берётся в браузере.
 */
export const NEWYEAR_EARLY_SCRIPT = buildNewYearEarlyScript(
  getDecorMode(),
  getDecorWindow().start,
  getDecorWindow().end
)
