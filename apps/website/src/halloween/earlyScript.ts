import { HALLOWEEN_ATTRIBUTE, HALLOWEEN_CANVAS, HALLOWEEN_UNTIL } from './config'

/**
 * Ставит `data-halloween` на `<html>` до первой отрисовки и перекрашивает
 * `theme-color`. Встраивается в `_document` после мета-тега, иначе тот ещё не
 * разобран и искать нечего.
 *
 * Скрипт, а не класс из React: фон страницы и паутинки на карточках обязаны
 * быть в первом кадре — после гидрации холст вспыхивал бы другим цветом. Дата
 * сверяется здесь же, в браузере, по той же причине, что и в `useHalloween`.
 */
export const HALLOWEEN_EARLY_SCRIPT = `(function(){try{
if(Date.now()>=${Date.parse(HALLOWEEN_UNTIL)})return;
document.documentElement.setAttribute('${HALLOWEEN_ATTRIBUTE}','');
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute('content','${HALLOWEEN_CANVAS}');
}catch(e){}})();`
