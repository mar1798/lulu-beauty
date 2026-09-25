import clsx from 'clsx'
import parse, {
  type DOMNode,
  domToReact,
  Element,
  type HTMLReactParserOptions,
} from 'html-react-parser'
import { createElement, type FC, type JSX, useMemo } from 'react'
import type { IBasicStyling, IRichTextProps } from '../../types'
import * as styles from './RichText.css'

/**
 * Описание товара с оформлением — то, что владелец написал в `RichTextEditor`.
 *
 * HTML приходит уже очищенным (бэкенд, `catalog/rich_text.py`), но в DOM он
 * всё равно попадает не строкой, а собранным заново: каждый разрешённый тег
 * создаётся здесь без единого атрибута из исходника, кроме адреса ссылки.
 * Поэтому `dangerouslySetInnerHTML` нет, и забытый бэкендом `onclick` или
 * `style` до страницы не доходит. Чужой тег разворачивается в свой текст, а
 * `script`/`style` выбрасываются вместе с содержимым.
 *
 * Список тегов — тот же, что у редактора и у бэкенда: абзац, перенос,
 * жирный, курсив, списки, подзаголовок `h2` и ссылка.
 */

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h2'])
const DROPPED_TAGS = new Set(['script', 'style'])
const SAFE_HREF = /^(https?:|mailto:|tel:)/i

/** Ссылка из описания ведёт на чужой сайт — поисковику не в зачёт, окну без `opener`. */
const LINK_REL = 'noopener noreferrer nofollow'

const options: HTMLReactParserOptions = {
  replace: (node: DOMNode): JSX.Element | undefined => {
    if (!(node instanceof Element)) {
      return undefined
    }

    const children = domToReact(node.children as DOMNode[], options)

    if (DROPPED_TAGS.has(node.name)) {
      return <></>
    }

    if (node.name === 'a') {
      const href = node.attribs.href?.trim() ?? ''

      return SAFE_HREF.test(href) ? (
        <a href={href} rel={LINK_REL}>
          {children}
        </a>
      ) : (
        <>{children}</>
      )
    }

    if (ALLOWED_TAGS.has(node.name)) {
      return node.name === 'br' ? <br /> : createElement(node.name, null, children)
    }

    return <>{children}</>
  },
}

export const RichText: FC<IRichTextProps & IBasicStyling> = ({ html, className }) => {
  const content = useMemo(() => parse(html, options), [html])

  return <div className={clsx(styles.container, className)}>{content}</div>
}
