import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ILegalTemplateProps } from '../../types'
import { Container } from '../../atoms/container'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import { formatDate } from '../../utils/datetime'
import * as styles from './LegalTemplate.css'

/**
 * Правовой документ: политика обработки данных, оферта — всё, что читают
 * подряд и на что ссылаются пунктом.
 *
 * Разделы нумеруются здесь, а не в тексте: номер — это адрес пункта, и
 * вписанный руками он разъезжается с порядком при первой же вставке раздела
 * в середину. По той же причине у каждого заголовка есть `id`: на пункт
 * должна работать ссылка.
 *
 * Абзац — строка, список — массив строк. Разметки в тексте нет намеренно:
 * документ читается целиком, и жирное слово посреди обязательства выделяет
 * не то, что важно, а то, что кто-то однажды посчитал важным.
 */
export const LegalTemplate: FC<ILegalTemplateProps & IBasicStyling> = ({
  title,
  updatedAt,
  summary,
  sections,
  footer,
  className,
}) => (
  <Container as="article" className={clsx(styles.container, className)}>
    <header className={styles.head}>
      <Heading level={1}>{title}</Heading>
      {/*
        Дата редакции — не украшение: человек, вернувшийся сюда через полгода,
        должен видеть, ту же ли бумагу он читает.

        Читателю — словами, машине — в `datetime`: ISO-дата в тексте документа
        читается как артефакт выгрузки, а не как дата. Форматирует общий
        `formatDate` в таймзоне магазина, поэтому SSR и гидратация совпадают.
      */}
      <Text size="sm" tone="muted" as="div">
        Редакция от <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
      </Text>
      {summary !== undefined && <Text tone="secondary">{summary}</Text>}
    </header>

    <div className={styles.sections}>
      {sections.map((section, index) => {
        const id = `section-${index + 1}`

        return (
          <section key={section.title} className={styles.section}>
            <Heading level={2} size="sm" id={id}>
              {`${index + 1}. ${section.title}`}
            </Heading>

            {section.body.map((block, blockIndex) =>
              Array.isArray(block) ? (
                <ul key={blockIndex} className={styles.list}>
                  {block.map(line => (
                    <li key={line} className={styles.listItem}>
                      <Text as="span" tone="secondary">
                        {line}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text key={blockIndex} tone="secondary">
                  {block}
                </Text>
              )
            )}
          </section>
        )
      })}
    </div>

    {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
  </Container>
)
