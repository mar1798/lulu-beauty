import { formatVolume } from './volume'

/**
 * Потолок длины метки под названием.
 *
 * Обрезка по символам, а не по ширине: метки стоят в одной строке, и та, что
 * длиннее остальных вместе взятых (случается у категорий из импорта), иначе
 * вытеснила бы их на вторую строку целиком. Значение подобрано под самую
 * узкую колонку сетки — две карточки в ряд на телефоне.
 */
export const TAG_MAX_CHARS = 18

export const clampTag = (value: string): string =>
  value.length > TAG_MAX_CHARS ? `${value.slice(0, TAG_MAX_CHARS - 1).trimEnd()}…` : value

interface IProductTagsInput {
  brand: string | null
  categoryName?: string | null
  volumeMl: number | null
}

/**
 * Метки товара — марка, категория, объём — одним списком.
 *
 * Каждая метка отдельной строкой массива, а не одной склеенной: склеенная
 * обрезалась целиком по ширине колонки, и от «Round lab · Cleanser · 1000 мл»
 * на телефоне оставалось «Round lab · Clea…» — категория и объём пропадали
 * вместе. Обрезка делается по метке (`clampTag`) там, где они рисуются.
 *
 * Объём последним — он уточняет товар, а не называет его. Пустые строки
 * отбрасываются наравне с `null`: из прайса приходит и то, и другое.
 */
export const productTags = ({ brand, categoryName, volumeMl }: IProductTagsInput): string[] =>
  [brand, categoryName, formatVolume(volumeMl)].filter(
    (value): value is string => value !== null && value !== undefined && value.trim() !== ''
  )
