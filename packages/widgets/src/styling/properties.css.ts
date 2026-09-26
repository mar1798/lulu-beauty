import { createVar } from '@vanilla-extract/css'

/**
 * Widely used CSS variable, which is used to define state of an element.
 * Generally hover or focus state. (see styles/util.css.ts:hoverable or active class)
 */
export const animateVar = createVar()

/**
 * Theme variable to define transition duration
 */
export const trnDelayVar = createVar()

export const trnEasingVar = createVar()

/**
 * Theme variable to define width of the main wrapper
 */
export const wrapperWidth = createVar()

export const wrapperPadding = createVar()

/**
 * Сколько сверху занимает прилипшая шапка сайта — для того, что прилипает под
 * ней (панель форматирования `RichTextEditor`). Выставляет `Header.css.ts`, и
 * только пока шапка действительно прилипает.
 */
export const headerOffset = createVar()
