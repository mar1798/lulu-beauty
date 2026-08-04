import clsx from 'clsx'
import { createElement, type FC } from 'react'
import type { IBasicStyling, IHeadingProps } from '../../types'
import * as styles from './Heading.css'

/**
 * Заголовок. Уровень (`level`) и размер (`size`) независимы: уровень задаёт
 * структуру документа для скринридера и поиска, размер — только внешность.
 * По умолчанию размер выводится из уровня, но его можно переопределить,
 * не ломая иерархию `h1…h6`.
 */

const SIZE_BY_LEVEL = {
  1: 'xl',
  2: 'lg',
  3: 'md',
  4: 'sm',
  5: 'xs',
  6: 'xs',
} as const

export const Heading: FC<IHeadingProps & IBasicStyling> = ({
  children,
  level = 2,
  size,
  tone = 'primary',
  id,
  className,
}) =>
  createElement(
    `h${level}`,
    {
      id,
      className: clsx(
        styles.container,
        styles.size[size ?? SIZE_BY_LEVEL[level]],
        styles.tone[tone],
        className
      ),
    },
    children
  )
