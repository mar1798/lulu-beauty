import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHomeTemplateProps } from '../../types'
import * as styles from './HomeTemplate.css'

/**
 * Раскладка главной: полноэкранный герой и следом full-bleed секции.
 *
 * Ширину контента шаблон больше не держит — `Container` живёт **внутри**
 * каждой секции (`HomeSection`): фону секции и декоративным пятнам нужно
 * выходить за границы контента, а герою — начинаться от края экрана.
 *
 * Секции приходят детьми, а не набором именованных слотов: их состав со
 * временем меняется, и шаблону незачем знать про каждую. Вертикальный ритм
 * держат сами секции своими отступами.
 */
export const HomeTemplate: FC<IHomeTemplateProps & IBasicStyling> = ({
  hero,
  children,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {hero}

    {children}
  </div>
)
