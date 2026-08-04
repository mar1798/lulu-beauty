import clsx from 'clsx'
import { createElement, type FC } from 'react'
import type { IBasicStyling, IContainerProps } from '../../types'
import * as styles from './Container.css'

/**
 * Ограничитель ширины контента по `wrapperWidth` из `global.css.ts`
 * (`min(100vw - 40px, 1128px)` — поля уже учтены в самой переменной).
 *
 * `as` позволяет не плодить лишний `div` там, где по смыслу нужен
 * `section`, `main` или `header`.
 */
export const Container: FC<IContainerProps & IBasicStyling> = ({
  children,
  as = 'div',
  width = 'wide',
  isPadded = false,
  className,
}) =>
  createElement(
    as,
    {
      className: clsx(
        styles.container,
        styles.width[width],
        isPadded && styles.padded,
        className
      ),
    },
    children
  )
