import { useSyncExternalStore } from 'react'
import { NEWYEAR_ATTRIBUTE } from './season'

const subscribe = (): (() => void) => () => undefined

const getSnapshot = (): boolean => document.documentElement.hasAttribute(NEWYEAR_ATTRIBUTE)

/**
 * Идёт ли сейчас новогоднее оформление.
 *
 * Источник один: атрибут `data-newyear` на `<html>`, который до первой отрисовки ставит
 * ранний скрипт (`earlyScript.ts`). По нему же CSS резервирует место под декор, поэтому
 * сам декор и зарезервированное место не могут разойтись. Значение фиксируется на момент
 * загрузки страницы: вкладка, открытая через полночь на границе окна, не включает и не
 * выключает декор до перезагрузки.
 *
 * На сервере и при гидрации - всегда `false`: страницы статические, собраны когда угодно,
 * и ответ сборки разошёлся бы с ответом браузера. Декор поэтому появляется после гидрации,
 * а не в первом кадре; то, что нужно в первом кадре (место под полосу, `row-gap` сетки),
 * держится на самом атрибуте.
 */
export const useNewYear = (): boolean => useSyncExternalStore(subscribe, getSnapshot, () => false)
