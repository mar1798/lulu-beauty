import clsx from 'clsx'
import { type FC } from 'react'
import { motion, type Variants } from 'motion/react'
import type { IBasicStyling, IStepSceneProps } from '../../types'
import { IconBox, IconCart, IconCheck } from '../../svg/icons'
import {
  APPEAR_OFFSET,
  REVEAL_STAGGER_STEP,
  REVEAL_TRANSITION,
  SCENE_POP_TRANSITION,
  staggerDelay,
} from '../../utils/motion'
import * as styles from './StepScene.css'

/**
 * Мини-макет интерфейса над текстом шага. Не иконка: иконка называет
 * предмет, а сцена показывает, что произойдёт на экране.
 *
 * Сцена — рисунок из токенов, а не превью настоящих данных: вместо текста —
 * полоски (живой текст конкурировал бы с заголовком шага и требовал бы
 * копирайта и проверки контраста), единственные слова — короткие ярлыки на
 * пилюлях («+1», «Заявка», «Итого»). Читать тут нечего, поэтому весь блок
 * `aria-hidden`.
 *
 * Части сцены входят лесенкой внутри `Reveal` своего шага: `variants`
 * наследуются от обёртки, своих `whileInView` у сцены нет. Пилюля «+1» и
 * галочка подтверждения приходят последними, с коротким «поп»-пружинием.
 * Зацикленных анимаций в сценах нет — непрерывное движение на странице
 * оставлено фоновым пятнам, ленте брендов и точке `StatusPanel`.
 */

/** Ступень лесенки частей сцены поверх задержки самого шага. */
const partDelay = (base: number, part: number): number =>
  base + staggerDelay(part) + REVEAL_STAGGER_STEP

const enterVariants = (delay: number): Variants => ({
  hidden: { opacity: 0, y: APPEAR_OFFSET },
  visible: { opacity: 1, y: 0, transition: { ...REVEAL_TRANSITION, delay } },
})

const popVariants = (delay: number): Variants => ({
  hidden: { opacity: 0, scale: 0.5 },
  visible: { opacity: 1, scale: 1, transition: { ...SCENE_POP_TRANSITION, delay } },
})

/** Товар кладут в корзину: карточка с «фото», пилюля «+1», корзина с бейджем. */
const CartScene: FC<{ base: number }> = ({ base }) => (
  <>
    <motion.span className={styles.cartCard} variants={enterVariants(partDelay(base, 0))}>
      <span className={styles.cartPhoto} />
      <span className={clsx(styles.bar, styles.barWide)} />
      <span className={clsx(styles.bar, styles.barNarrow)} />

      <motion.span className={styles.plusPill} variants={popVariants(partDelay(base, 2))}>
        +1
      </motion.span>
    </motion.span>

    <motion.span className={styles.cartCorner} variants={enterVariants(partDelay(base, 1))}>
      <IconCart className={styles.cartIcon} />
      <span className={styles.cartBadge}>3</span>
    </motion.span>
  </>
)

/** Корзина превращается в заявку: строки с ценами, «Итого», пилюля «Заявка». */
const RequestScene: FC<{ base: number }> = ({ base }) => (
  <>
    <motion.span className={styles.requestRows} variants={enterVariants(partDelay(base, 0))}>
      {[styles.barWide, styles.barMid, styles.barWide].map((width, index) => (
        <span key={index} className={styles.requestRow}>
          <span className={clsx(styles.bar, width)} />
          <span className={clsx(styles.bar, styles.barPrice)} />
        </span>
      ))}

      <span className={styles.requestDivider} />

      <span className={styles.requestRow}>
        <span className={styles.totalLabel}>Итого</span>
        <span className={clsx(styles.bar, styles.barTotal)} />
      </span>
    </motion.span>

    <motion.span className={styles.requestPill} variants={popVariants(partDelay(base, 2))}>
      Заявка
    </motion.span>
  </>
)

/** Решение приходит в чат: пузырь сообщения с галочкой и полосками текста. */
const ConfirmScene: FC<{ base: number }> = ({ base }) => (
  <motion.span className={styles.bubble} variants={enterVariants(partDelay(base, 0))}>
    <motion.span className={styles.bubbleCheck} variants={popVariants(partDelay(base, 2))}>
      <IconCheck />
    </motion.span>

    <span className={styles.bubbleLines}>
      <span className={clsx(styles.bar, styles.barWide)} />
      <span className={clsx(styles.bar, styles.barNarrow)} />
    </span>
  </motion.span>
)

/** Товар получен: коробка и чек-лист с галочками. */
const HandoverScene: FC<{ base: number }> = ({ base }) => (
  <>
    <motion.span className={styles.boxTile} variants={enterVariants(partDelay(base, 0))}>
      <IconBox className={styles.boxIcon} />
    </motion.span>

    <motion.span className={styles.checkList} variants={enterVariants(partDelay(base, 1))}>
      {[styles.barMid, styles.barNarrow].map((width, index) => (
        <span key={index} className={styles.checkRow}>
          <span className={styles.checkDot}>
            <IconCheck />
          </span>
          <span className={clsx(styles.bar, width)} />
        </span>
      ))}
    </motion.span>
  </>
)

const SCENES: Record<IStepSceneProps['kind'], FC<{ base: number }>> = {
  cart: CartScene,
  request: RequestScene,
  confirm: ConfirmScene,
  handover: HandoverScene,
}

export const StepScene: FC<IStepSceneProps & IBasicStyling> = ({
  kind,
  delay = 0,
  className,
}) => {
  const Scene = SCENES[kind]

  return (
    <span className={clsx(styles.container, className)} aria-hidden={true}>
      <Scene base={delay} />
    </span>
  )
}
