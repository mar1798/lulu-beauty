import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IErrorTemplateProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './ErrorTemplate.css'

/**
 * Экран ошибки: 404, 500 и всё, что рисуется вместо страницы целиком.
 *
 * Код вынесен отдельной крупной строкой и скрыт от скринридера: «404» без
 * контекста он прочитает как число, а смысл несёт заголовок. Сам заголовок —
 * `h1`: другого смыслового заголовка на такой странице нет.
 */
export const ErrorTemplate: FC<IErrorTemplateProps & IBasicStyling> = ({
  code,
  title,
  description,
  actions,
  details,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <section className={styles.card}>
      {code !== undefined && (
        <span className={styles.code} aria-hidden={true}>
          {code}
        </span>
      )}

      <div className={styles.head}>
        <Heading level={1} size="md">
          {title}
        </Heading>

        {description !== undefined && <Text tone="secondary">{description}</Text>}
      </div>

      {actions !== undefined && <div className={styles.actions}>{actions}</div>}

      {details !== undefined && <div className={styles.details}>{details}</div>}
    </section>
  </div>
)
