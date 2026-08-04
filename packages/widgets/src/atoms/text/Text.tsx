import clsx from 'clsx'
import { createElement, type FC } from 'react'
import type { IBasicStyling, ITextProps } from '../../types'
import * as styles from './Text.css'

/**
 * Текстовый блок на токенах. `as` позволяет выбрать тег (`p`, `span`, `div`)
 * — размер и цвет от этого не зависят, а вот вложенность и семантика зависят:
 * `<p>` внутри `<p>` браузер молча разрывает.
 */
export const Text: FC<ITextProps & IBasicStyling> = ({
  children,
  as = 'p',
  size = 'md',
  weight = 'regular',
  tone = 'primary',
  clamp,
  className,
}) =>
  createElement(
    as,
    {
      className: clsx(
        styles.container,
        styles.size[size],
        styles.weight[weight],
        styles.tone[tone],
        clamp !== undefined && styles.clamp[clamp],
        className
      ),
    },
    children
  )
