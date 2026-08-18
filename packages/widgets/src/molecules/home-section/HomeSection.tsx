import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHomeSectionProps } from '../../types'
import { Container } from '../../atoms/container'
import * as styles from './HomeSection.css'

/**
 * Секция главной: full-bleed фон и слой под `DecorField`, а контент — в
 * `Container`. Ширину страницы больше не держит `HomeTemplate`, поэтому
 * каждая секция ограничивает её сама.
 *
 * `sectionRef` отдаётся наружу, а не заводится внутри: тот же ref нужен
 * `DecorField.containerRef`, а слот с ним рендерит страница.
 *
 * Секция с `background` получает `min-height` — несущую часть инварианта
 * «товар виден целиком»: короткая секция обрежет баночку, и никакой подбор
 * позиций пятна этого не исправит (см. `HomeSection.css.ts`).
 */
export const HomeSection: FC<IHomeSectionProps & IBasicStyling> = ({
  children,
  background,
  tone = 'plain',
  density = 'default',
  sectionRef,
  id,
  className,
}) => (
  <section
    ref={sectionRef}
    id={id}
    className={clsx(
      styles.container,
      styles.density[density],
      styles.tone[tone],
      background !== undefined && styles.withDecor,
      className,
    )}
  >
    {background !== undefined && background}

    <Container className={styles.content}>{children}</Container>
  </section>
)
