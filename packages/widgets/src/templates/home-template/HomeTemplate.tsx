import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHomeTemplateProps } from '../../types'
import { Container } from '../../atoms/container'
import * as styles from './HomeTemplate.css'

/**
 * Раскладка главной: первый экран и следом секции.
 *
 * Секции приходят детьми, а не набором именованных слотов: их состав со
 * временем поменяется (подборка, категории, отзывы), и шаблону незачем знать
 * про каждую. Его дело — ширина и вертикальный ритм между блоками.
 */
export const HomeTemplate: FC<IHomeTemplateProps & IBasicStyling> = ({
  hero,
  children,
  className,
}) => (
  <Container className={clsx(styles.container, className)}>
    {hero}

    {children}
  </Container>
)
