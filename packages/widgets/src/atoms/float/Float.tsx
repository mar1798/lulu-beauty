import clsx from 'clsx'
import { useRef, type CSSProperties, type FC } from 'react'
import { useInView } from 'motion/react'
import type { IBasicStyling, IFloatProps } from '../../types'
import {
  FLOAT_ACTIVATION_MARGIN,
  floatTiming,
  SHOWCASE_FLOAT_DURATION_MS,
} from '../../utils/motion'
import * as styles from './Float.css'

/**
 * Непрерывная левитация содержимого — тот же приём, которым дышат фоновые
 * баночки `DecorField`, но для переднего плана: карточек витрины в герое.
 *
 * Обёртка, а не свойство карточки, и это принципиально. У `ProductCard` свой
 * transform занят подъёмом на наведении, и общий на двоих молча перетёр бы
 * один другим — ровно та причина, по которой у пятна три вложенных слоя
 * движения вместо одного. Отдельный элемент разводит их честно: левитация
 * живёт снаружи, наведение — внутри.
 *
 * Соседи разводятся по трём осям сразу: `phase` двигает стартовую точку и
 * период (`floatTiming`), `distance` — амплитуду. Одной фазы мало: при равной
 * амплитуде три карточки ходят по одной дуге, просто вразнобой, и кластер
 * всё равно читается как один качающийся объект.
 *
 * За кадром анимация встаёт, при `prefers-reduced-motion` её нет вовсе —
 * движение декоративное, и терять без него нечего.
 */
export const Float: FC<IFloatProps & IBasicStyling> = ({
  phase = 0,
  distance,
  children,
  className,
}) => {
  const ref = useRef<HTMLDivElement | null>(null)

  /*
    Наблюдатель на каждую карточку, а не один на кластер: в герое их три, и
    три подписки дешевле, чем лишний слой обёрток ради общей. При сокращённом
    движении подписка всё равно остаётся — она ничего не двигает, а только
    ставит класс паузы поверх уже выключенной медиазапросом анимации.
  */
  const isActive = useInView(ref, { margin: FLOAT_ACTIVATION_MARGIN })

  /*
    Амплитуду задаём только когда её передали: иначе пусть работает значение
    по умолчанию из класса, а не инлайновое «то же самое число» на каждом
    элементе.
  */
  const style: CSSProperties = {
    ...floatTiming(SHOWCASE_FLOAT_DURATION_MS, phase),
    ...(distance === undefined ? {} : { [styles.FLOAT_DISTANCE_PROPERTY]: `${distance}px` }),
  }

  return (
    <div
      ref={ref}
      className={clsx(styles.container, !isActive && styles.paused, className)}
      style={style}
    >
      {children}
    </div>
  )
}
