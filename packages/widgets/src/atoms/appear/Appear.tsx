import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { type FC } from 'react'
import type { IAppearProps, IBasicStyling } from '../../types'
import { APPEAR_OFFSET, APPEAR_TRANSITION } from '../../utils/motion'
import * as styles from './Appear.css'

/**
 * Проявление блока, вставшего на место скелетона.
 *
 * Зачем вообще: подмена скелетона данными — это мгновенная перерисовка всего
 * прямоугольника, и глаз читает её как скачок. Короткое проявление превращает
 * скачок в смену состояния.
 *
 * Сдвиг задаётся строкой `transform`, а не отдельным `y`: обе величины идут
 * с одной настройкой, и Motion уводит такую анимацию в WAAPI, то есть с
 * основного потока. При `prefers-reduced-motion` остаётся одна прозрачность —
 * движение убирается, а смена состояния по-прежнему заметна.
 *
 * `appearKey` нужен там, где содержимое подменяется без размонтирования:
 * без него переход между страницами каталога прошёл бы молча.
 */
export const Appear: FC<IAppearProps & IBasicStyling> = ({
  children,
  appearKey,
  delay = 0,
  className,
}) => {
  const isReduced = useReducedMotion() ?? false

  return (
    <motion.div
      key={appearKey}
      className={clsx(styles.container, className)}
      initial={
        isReduced ? { opacity: 0 } : { opacity: 0, transform: `translateY(${APPEAR_OFFSET}px)` }
      }
      animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
      transition={{ ...APPEAR_TRANSITION, delay }}
    >
      {children}
    </motion.div>
  )
}
