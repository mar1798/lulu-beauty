import React from 'react'
import type { IJsonLdNode } from '@/utils/jsonLd'

/**
 * Микроразметка одной страницы: `<script type="application/ld+json">`.
 *
 * Тег рисуется в теле страницы, а не через `next/head`: поисковик читает
 * разметку в любом месте документа, а `next/head` со скриптом внутри — лишний
 * повод для его дедупликации по ключам. Ограничение CSP тут ни при чём:
 * `ld+json` — блок данных, браузер его не исполняет.
 *
 * Узлы собирает `utils/jsonLd.ts`; сюда приходит уже готовый объект.
 */

interface IJsonLdProps {
  data: IJsonLdNode
}

/**
 * Данные внутри `<script>` живут по правилам HTML, а не JSON: последовательность
 * `</script>` в любом значении закрыла бы тег и вывалила остаток разметки в
 * страницу. Экранируется `<` целиком — для JSON это законный escape, и
 * `JSON.parse` читает его как обычный символ.
 */
function serialize(data: IJsonLdNode): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export const JsonLd: React.FC<IJsonLdProps> = ({ data }) => (
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(data) }} />
)
