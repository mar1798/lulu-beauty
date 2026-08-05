import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ISectionHeadingProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './SectionHeading.css'

/**
 * Шапка секции: надзаголовок, заголовок, описание и ссылка вбок.
 *
 * Надзаголовок — обычный текст, а не заголовок ступенью выше: он подписывает
 * секцию («Свежая подборка»), но своей ступени в структуре документа не
 * создаёт, и `h2` из него получилась бы ложной.
 */
export const SectionHeading: FC<ISectionHeadingProps & IBasicStyling> = ({
  eyebrow,
  title,
  description,
  level = 2,
  action,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <div className={styles.text}>
      {eyebrow !== undefined && <span className={styles.eyebrow}>{eyebrow}</span>}

      <Heading level={level}>{title}</Heading>

      {description !== undefined && <Text tone="secondary">{description}</Text>}
    </div>

    {action !== undefined && <div className={styles.action}>{action}</div>}
  </div>
)
