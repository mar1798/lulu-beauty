import clsx from 'clsx'
import { useId, useState, type FC, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { IBasicStyling, IFaqAccordionProps, IFaqItem } from '../../types'
import { IconChevronDown } from '../../svg/icons'
import { Reveal } from '../../atoms/reveal'
import { AppLink } from '../../atoms/app-link'
import { FAQ_TRANSITION, staggerDelay } from '../../utils/motion'
import * as styles from './FaqAccordion.css'

/**
 * Метка места ссылки в тексте ответа: подпись `action.label` встаёт вместо
 * неё. Так ссылка попадает в середину фразы, оставаясь данными, — иначе
 * пришлось бы принимать готовый узел, а вместе с ним и чужую вёрстку.
 */
const LINK_SLOT = '{link}'

/**
 * Ответ строкой плюс ссылка в месте `{link}`. Без метки ссылка встаёт в
 * конце абзаца — отдельной строкой она читалась бы кнопкой.
 */
const renderAnswer = (item: IFaqItem): ReactNode => {
  if (item.action === undefined) {
    return item.answer
  }

  const [before, after] = item.answer.includes(LINK_SLOT)
    ? item.answer.split(LINK_SLOT)
    : [`${item.answer} `, '']

  return (
    <>
      {before}
      <AppLink className={styles.answerLink} {...item.action.link}>
        {item.action.label}
      </AppLink>
      {after}
    </>
  )
}

/**
 * FAQ-аккордеон: строки с волосяными границами, раскрытие по кнопке.
 *
 * Именно `<button aria-expanded>`, а не `<details>/<summary>`: анимировать
 * раскрытие `details` без скачка не выходит (контент появляется до старта
 * анимации, а Safari ломает `overflow` внутри `summary`), кнопка же даёт ту
 * же семантику и полностью управляемую анимацию.
 *
 * Анимация высоты — осознанное исключение из правила «только
 * transform/opacity/filter»: `scaleY` растягивал бы буквы ответа, `clip-path`
 * оставлял бы дыру в потоке, а без анимации соседние строки прыгают.
 * Раскрытие происходит по явному действию человека, затрагивает один элемент
 * и не идёт в скролл-кадре.
 */
export const FaqAccordion: FC<IFaqAccordionProps & IBasicStyling> = ({
  items,
  isMultiple = false,
  defaultOpenIndex,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false
  const baseId = useId()
  const [openIndexes, setOpenIndexes] = useState<number[]>(
    defaultOpenIndex === undefined ? [] : [defaultOpenIndex]
  )

  const toggle = (index: number): void => {
    setOpenIndexes(current => {
      if (current.includes(index)) {
        return current.filter(item => item !== index)
      }

      return isMultiple ? [...current, index] : [index]
    })
  }

  return (
    <div className={clsx(styles.container, className)}>
      {items.map((item, index) => {
        const isOpen = openIndexes.includes(index)
        const buttonId = `${baseId}-faq-${index}`
        const panelId = `${buttonId}-panel`

        const answer = (
          <div className={styles.panelBody}>
            <p className={styles.answer}>{renderAnswer(item)}</p>
          </div>
        )

        return (
          <Reveal key={item.question} className={styles.row} delay={staggerDelay(index)}>
            <h3 className={styles.heading}>
              <button
                type="button"
                id={buttonId}
                className={styles.trigger}
                aria-expanded={isOpen}
                /*
                  Свёрнутая панель размонтирована (иначе не сыграть выход), а
                  `aria-controls` на несуществующий id — битая ссылка ARIA: её
                  ловят и валидаторы, и часть скринридеров. Состояние строки
                  целиком несёт `aria-expanded`.
                */
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => toggle(index)}
              >
                <span className={styles.question}>{item.question}</span>

                <IconChevronDown className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
              </button>
            </h3>

            {isReduced ? (
              /* Без движения ответ появляется и исчезает мгновенно и целиком. */
              isOpen && (
                <div id={panelId} role="region" aria-labelledby={buttonId}>
                  {answer}
                </div>
              )
            ) : (
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className={styles.panel}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={FAQ_TRANSITION}
                  >
                    {answer}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </Reveal>
        )
      })}
    </div>
  )
}
