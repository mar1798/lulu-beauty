import clsx from 'clsx'
import { useRef, type FC } from 'react'
import { useInView } from 'motion/react'
import type { IBasicStyling, IShowcaseMoreProps } from '../../types'
import { IconChevronRight } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { FLOAT_ACTIVATION_MARGIN } from '../../utils/motion'
import * as styles from './ShowcaseMore.css'

/**
 * Замыкающая плитка витрины: «а вот и весь остальной каталог».
 *
 * Той же формы и материала, что карточка товара, и стоит с ними в одном ряду.
 * Отличают её не поверхность, а содержимое и рамка: вместо фотографии и цены —
 * стрелка, а по краю бежит марочная линия. Внутри нет ни названия, ни цены
 * намеренно — плитка не должна притворяться четвёртым товаром.
 *
 * Живёт только на телефоне (герой прячет её с `md`, см. `HomeHero.css.ts`):
 * там лента упирается в край экрана, последняя карточка уезжает за него, и без
 * плитки конец списка выглядит как обрыв. Начиная с планшета карточки
 * умещаются целиком, обрыва не видно, и плитка стала бы повтором кнопки
 * «смотреть каталог» из левой колонки.
 */
export const ShowcaseMore: FC<IShowcaseMoreProps & IBasicStyling> = ({
  label,
  hint,
  link,
  className,
}) => {
  const ref = useRef<HTMLSpanElement | null>(null)

  /*
    За кадром луч встаёт — как левитация у `Float`, и по той же причине:
    бесконечная анимация иначе крутится в композиторе всё время, что открыта
    вкладка, а плитка живёт в первом экране и уезжает из кадра сразу за ним.
    Слой у неё вдобавок крупный (`beam` — 250 % от плитки) и залит коническим
    градиентом, так что кадр ему обходится дороже, чем пятну.
  */
  const isActive = useInView(ref, { margin: FLOAT_ACTIVATION_MARGIN })

  return (
    <AppLink {...link} className={clsx(styles.container, className)}>
      {/* Луч лежит под поверхностью; наружу видна только его кромка в рамке. */}
      <span className={clsx(styles.beam, !isActive && styles.beamPaused)} aria-hidden={true} />

      {/* Наблюдатель висит на поверхности, а не на ссылке: `AppLink` — адаптер
          из контейнера сервисов, своего DOM-узла наружу он не отдаёт. */}
      <span ref={ref} className={styles.surface}>
        <span className={styles.icon} aria-hidden={true}>
          <IconChevronRight />
        </span>

        <span className={styles.label}>{label}</span>

        {hint !== undefined && <span className={styles.hint}>{hint}</span>}
      </span>
    </AppLink>
  )
}
