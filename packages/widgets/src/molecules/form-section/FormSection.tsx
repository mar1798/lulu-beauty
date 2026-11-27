import clsx from 'clsx'
import { m, useReducedMotion } from 'motion/react'
import { type FC, useId } from 'react'
import type { IBasicStyling, IFormSectionProps } from '../../types'
import { IconChevronDown } from '../../svg/icons'
import { FAQ_TRANSITION } from '../../utils/motion'
import * as styles from './FormSection.css'

/**
 * Сворачиваемая панель формы: кнопка-заголовок с `aria-expanded` и тело,
 * высота которого анимируется (то же исключение, что в `FaqAccordion`). Пока
 * тело раскрывается, `overflow` скрыт, а по окончании становится видимым —
 * иначе обрезались бы кольца фокуса у краёв полей и выпадающие списки.
 *
 * Свёрнутая секция не размонтируется: её поля и состояние редакторов остаются
 * на месте, а от Tab и скринридера они прячутся через `visibility` после того,
 * как доиграет сворачивание. Общая для форм акции и промокода админки.
 */
export const FormSection: FC<IFormSectionProps & IBasicStyling> = ({
  title,
  summary,
  isOpen,
  onToggle,
  children,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false
  const baseId = useId()
  const triggerId = `${baseId}-trigger`
  const bodyId = `${baseId}-body`

  return (
    <section className={clsx(styles.panel, className)} aria-labelledby={triggerId}>
      <h2 className={styles.sectionHeading}>
        <button
          type="button"
          id={triggerId}
          className={styles.sectionTrigger}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className={styles.sectionTitle}>{title}</span>
          {summary !== undefined && <span className={styles.sectionSummary}>{summary}</span>}
          <IconChevronDown className={clsx(styles.chevron, isOpen && styles.chevronOpen)} />
        </button>
      </h2>

      <m.div
        id={bodyId}
        role="region"
        aria-labelledby={triggerId}
        className={clsx(styles.sectionBody, !isOpen && styles.sectionBodyClosed)}
        initial={false}
        animate={
          isOpen
            ? { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
            : { height: 0, opacity: 0, overflow: 'hidden' }
        }
        transition={isReduced ? { duration: 0 } : FAQ_TRANSITION}
      >
        <div className={styles.sectionInner}>{children}</div>
      </m.div>
    </section>
  )
}
