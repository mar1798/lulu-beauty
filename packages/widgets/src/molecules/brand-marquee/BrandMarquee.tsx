import clsx from 'clsx'
import { useRef, type FC } from 'react'
import { useInView } from 'motion/react'
import type { IBasicStyling, IBrandMarqueeProps } from '../../types'
import { AppLink } from '../../atoms/app-link'
import * as styles from './BrandMarquee.css'

/**
 * Непрерывная лента брендов. Дорожка продублирована дважды и едет на
 * `translateX(-50%)` — бесшовный цикл на чистом CSS, без единого кадра JS.
 *
 * Дубль — только для бесшовности: он `aria-hidden` (иначе скринридер
 * прочитал бы список дважды) и без ссылок (иначе Tab обходил бы невидимые
 * копии). Пауза на `:hover`/`:focus-within` и режим обычной прокручиваемой
 * строки при `prefers-reduced-motion` живут в CSS.
 *
 * За кадром лента стоит: это единственная бесконечная анимация страницы, и
 * без паузы она крутила бы композитор всё время, что открыта вкладка, — на
 * телефоне это просто расход батареи ни на что.
 */

/**
 * Секунды на один бренд при расчёте оборота по умолчанию: длинная лента едет
 * с той же линейной скоростью, что и короткая, а не «за то же время».
 */
export const SECONDS_PER_BRAND = 3

export const BrandMarquee: FC<IBrandMarqueeProps & IBasicStyling> = ({
  brands,
  buildHref,
  durationSeconds,
  className,
}) => {
  const duration = durationSeconds ?? brands.length * SECONDS_PER_BRAND
  const containerRef = useRef<HTMLDivElement>(null)
  /* `amount: 'some'` — лента узкая, порога по площади ей хватает минимального. */
  const isInView = useInView(containerRef, { amount: 'some' })

  return (
    <div ref={containerRef} className={clsx(styles.container, className)}>
      <div
        className={clsx(styles.track, !isInView && styles.trackPaused)}
        /* Длительность зависит от числа брендов — данным в CSS взяться неоткуда. */
        style={{ animationDuration: `${duration}s` }}
      >
        <ul className={styles.row}>
          {brands.map(brand => (
            <li key={brand}>
              <AppLink href={buildHref(brand)} className={styles.link}>
                {brand}
              </AppLink>
            </li>
          ))}
        </ul>

        <ul className={styles.row} aria-hidden={true}>
          {brands.map(brand => (
            <li key={brand}>
              <span className={styles.link}>{brand}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
