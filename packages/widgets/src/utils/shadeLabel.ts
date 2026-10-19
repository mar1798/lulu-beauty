import type { ShadeLabel } from '../types'

/**
 * Формы слова, которым товар называет тона, — столько, сколько их встречается
 * в копии: «Выбрать цвет», «Без цвета», «при этом цвете», «с этим цветом»,
 * «Все цвета», «Для всех цветов». Словарь, а не одно слово, потому что
 * склонение руками не выводится, а следующее значение может оказаться женского
 * рода («Текстура» — «Выбрать текстуру»).
 */
export interface IShadeLabelForms {
  /** Именительный, с заглавной: подпись ряда и колонки — «Цвет». */
  title: string
  /** Винительный: «Выбрать цвет», «Укажите цвет». */
  accusative: string
  /** Родительный: «Без цвета», «группа цвета». */
  genitive: string
  /** Творительный: «с этим цветом». */
  instrumental: string
  /** Предложный: «при этом цвете». */
  prepositional: string
  /** Именительный множественного: «Все цвета». */
  plural: string
  /** Родительный множественного: «Для всех цветов». */
  genitivePlural: string
}

/**
 * Формы каждого значения `ShadeLabel`. Русские названия совпадают с
 * `SHADE_LABEL_NAMES` бэкенда — их пишет и читает лист каталога.
 */
export const SHADE_LABEL_FORMS: Record<ShadeLabel, IShadeLabelForms> = {
  TONE: {
    title: 'Тон',
    accusative: 'тон',
    genitive: 'тона',
    instrumental: 'тоном',
    prepositional: 'тоне',
    plural: 'тона',
    genitivePlural: 'тонов',
  },
  COLOR: {
    title: 'Цвет',
    accusative: 'цвет',
    genitive: 'цвета',
    instrumental: 'цветом',
    prepositional: 'цвете',
    plural: 'цвета',
    genitivePlural: 'цветов',
  },
  SHADE: {
    title: 'Оттенок',
    accusative: 'оттенок',
    genitive: 'оттенка',
    instrumental: 'оттенком',
    prepositional: 'оттенке',
    plural: 'оттенки',
    genitivePlural: 'оттенков',
  },
  SCENT: {
    title: 'Аромат',
    accusative: 'аромат',
    genitive: 'аромата',
    instrumental: 'ароматом',
    prepositional: 'аромате',
    plural: 'ароматы',
    genitivePlural: 'ароматов',
  },
}

/** Значения в порядке, в котором их предлагает форма товара. */
export const SHADE_LABELS = Object.keys(SHADE_LABEL_FORMS) as ShadeLabel[]

/** Формы для товара; без значения — «Тон», как называлось всё до появления выбора. */
export const shadeLabelForms = (label: ShadeLabel | null | undefined): IShadeLabelForms =>
  SHADE_LABEL_FORMS[label ?? 'TONE']
