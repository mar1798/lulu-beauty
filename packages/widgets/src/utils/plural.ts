/**
 * Русское склонение существительных при числительном.
 *
 * `Intl.PluralRules` даёт категорию (`one`/`few`/`many`), но не сами формы,
 * поэтому формы передаются вызывающей стороной: «1 позиция», «2 позиции»,
 * «5 позиций».
 */

const RULES = new Intl.PluralRules('ru-RU')

/** Формы в порядке `one`, `few`, `many`: `['позиция', 'позиции', 'позиций']`. */
export type IPluralForms = readonly [one: string, few: string, many: string]

export const plural = (count: number, forms: IPluralForms): string => {
  const category = RULES.select(count)

  if (category === 'one') {
    return forms[0]
  }

  return category === 'few' ? forms[1] : forms[2]
}

/** «3 позиции» — число вместе с нужной формой. */
export const pluralize = (count: number, forms: IPluralForms): string =>
  `${count} ${plural(count, forms)}`
