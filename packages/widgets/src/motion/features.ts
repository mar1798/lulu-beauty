import { domMax } from 'motion/react'

/**
 * Возможности motion — анимации, жесты, `layout` — отдельным чанком.
 *
 * Лежит вне папок с бочками (`.barrelsby.json`) намеренно: статический импорт из
 * бочки вернул бы весь `domMax` в общий бандл, ради выноса которого файл и
 * существует. Грузит его только `MotionProvider` — динамическим `import()`.
 */
export default domMax
