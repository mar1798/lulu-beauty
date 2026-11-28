import clsx from 'clsx'
import { type FC } from 'react'
import type { IAuthTemplateProps, IBasicStyling } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './AuthTemplate.css'

/**
 * Узкая центрированная карточка для входа, регистрации и ввода кода.
 *
 * Заголовок — `h1`: у страниц авторизации это единственный смысловой
 * заголовок, и делать его вложенным уровнем незачем.
 */
export const AuthTemplate: FC<IAuthTemplateProps & IBasicStyling> = ({
  title,
  subtitle,
  children,
  footer,
  decor,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    <section className={styles.card}>
      <div className={styles.head}>
        <Heading level={1} size="sm">
          {title}
        </Heading>
        {subtitle !== undefined && (
          <Text size="sm" tone="secondary">
            {subtitle}
          </Text>
        )}
      </div>

      {children}

      {/* Сезонный декор: слой без места в потоке, поверх края карточки. */}
      {decor !== undefined && (
        <div className={styles.decor} aria-hidden={true}>
          {decor}
        </div>
      )}
    </section>

    {footer !== undefined && <div className={styles.footer}>{footer}</div>}
  </div>
)
