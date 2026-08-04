import React from 'react'
import NextLink from 'next/link'
import type { IBasicStyling, ILink, IWrapperComponent } from 'widgets/types'

/**
 * Адаптер `components.Link` для `ServicesContext`. Виджеты знают только
 * про этот интерфейс, а `next/link` живёт здесь — так библиотека
 * не зависит от роутера приложения.
 *
 * Внешние адреса и явный `legacy` уходят в обычную `<a>`: клиентская
 * навигация Next для них бессмысленна.
 */
const isExternal = (href: string): boolean => /^(https?:)?\/\//.test(href) || href.startsWith('mailto:')

export const Link: React.FC<IWrapperComponent & ILink & IBasicStyling> = ({
  href,
  children,
  className,
  legacy,
  ...rest
}) => {
  if (legacy === true || isExternal(href)) {
    return (
      <a
        href={href}
        className={className}
        {...rest}
        rel={rest.target === '_blank' ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    )
  }

  return (
    <NextLink href={href} className={className} {...rest}>
      {children}
    </NextLink>
  )
}
