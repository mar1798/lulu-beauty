import clsx from 'clsx'
import { type FC } from 'react'
import type { IAdminLayoutProps, IBasicStyling } from '../../types'
import { AppLink } from '../../atoms/app-link'
import { Container } from '../../atoms/container'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './AdminLayout.css'

/**
 * Раскладка админки: разделы слева, заголовок с кнопками и содержимое справа.
 *
 * Разделы — обычные ссылки, а не табы: у каждого свой адрес, и «открыть в
 * новой вкладке», «назад» и закладка на нужный экран должны работать. Тот же
 * принцип, что в `AccountTemplate`, но разделов больше, они с иконками и на
 * широком экране колонка остаётся видимой при прокрутке.
 *
 * Фильтры раздела (`sidebar`) живут в той же левой колонке под разделами —
 * так они не отнимают ширину у содержимого: таблицы админки и без того
 * упираются в край. На телефоне колонок нет, и четыре блока (разделы,
 * заголовок, фильтры, содержимое) выстраиваются в один столбец — порядок
 * задаёт CSS, см. `AdminLayout.css.ts`.
 *
 * Ширина — `wide`: таблицы товаров и заявок не помещаются в колонку статьи.
 */
export const AdminLayout: FC<IAdminLayoutProps & IBasicStyling> = ({
  title,
  summary,
  navigation,
  currentHref,
  actions,
  sidebar,
  children,
  className,
}) => (
  <Container as="section" width="wide" className={clsx(styles.container, className)}>
    <div className={styles.body}>
      <div className={styles.side}>
        {/* Активный пункт подсвечивается по `aria-current` в CSS — как в шапке. */}
        <nav className={styles.nav} aria-label="Разделы админки">
          {navigation.map(item => (
            <AppLink
              key={item.link.href}
              {...item.link}
              className={styles.navLink}
              aria-current={item.link.href === currentHref ? 'page' : undefined}
            >
              {item.icon !== undefined && <span className={styles.navIcon}>{item.icon}</span>}
              {item.label}
            </AppLink>
          ))}
        </nav>

        {sidebar !== undefined && <aside className={styles.aside}>{sidebar}</aside>}
      </div>

      <div className={styles.content}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <Heading level={1} size="lg">
              {title}
            </Heading>
            {summary !== undefined && (
              <Text tone="secondary" size="sm">
                {summary}
              </Text>
            )}
          </div>

          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </div>

        <div className={styles.main}>{children}</div>
      </div>
    </div>
  </Container>
)
