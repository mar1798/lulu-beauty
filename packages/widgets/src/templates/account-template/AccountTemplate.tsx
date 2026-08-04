import clsx from 'clsx'
import { type FC } from 'react'
import type { IAccountTemplateProps, IBasicStyling } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Container } from '../../atoms/container'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './AccountTemplate.css'

/**
 * Раскладка личного кабинета: навигация раздела слева, содержимое справа.
 *
 * Навигация — обычный `<nav>` со ссылками, а не табы: заявки и профиль
 * живут по разным адресам, и на них должно работать «открыть в новой
 * вкладке» и кнопка «назад».
 */
export const AccountTemplate: FC<IAccountTemplateProps & IBasicStyling> = ({
  title,
  summary,
  navigation,
  currentHref,
  children,
  className,
}) => (
  <Container as="section" className={clsx(styles.container, className)}>
    <div className={styles.head}>
      <Heading level={1}>{title}</Heading>
      {summary !== undefined && <Text tone="secondary">{summary}</Text>}
    </div>

    <div className={styles.body}>
      {/* Активный пункт подсвечивается по `aria-current` в CSS — как в шапке. */}
      <nav className={styles.nav} aria-label="Личный кабинет">
        {navigation.map(item => (
          <AppLink
            key={item.link.href}
            {...item.link}
            className={styles.navLink}
            aria-current={item.link.href === currentHref ? 'page' : undefined}
          >
            {item.label}
          </AppLink>
        ))}
      </nav>

      <div className={styles.content}>{children}</div>
    </div>
  </Container>
)
