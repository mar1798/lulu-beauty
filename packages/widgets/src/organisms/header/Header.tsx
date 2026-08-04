import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHeaderProps } from '../../types'
import { IconCart, IconMenu, IconUser } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { Container } from '../../atoms/container'
import { IconButton } from '../../atoms/icon-button'
import * as styles from './Header.css'

/**
 * Шапка сайта. Полностью презентационная: и навигация, и счётчик корзины,
 * и текущий пользователь приходят пропсами — данные живут в `apps/website`.
 *
 * Кнопка мобильного меню появляется только там, где прячется навигация, и
 * ничего не открывает сама: `MobileMenu` (Drawer) — отдельный организм,
 * состоянием которого владеет страница.
 */
export const Header: FC<IHeaderProps & IBasicStyling> = ({
  logo,
  navigation,
  cartLink,
  cartCount = 0,
  user,
  loginLink,
  currentHref,
  notice,
  onMenuClick,
  className,
}) => (
  <header className={clsx(styles.container, className)}>
    <Container as="div">
      <div className={styles.inner}>
        <AppLink {...logo.link} className={styles.logo}>
          {logo.label}
        </AppLink>

        <nav className={styles.nav} aria-label="Основная навигация">
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

        <div className={styles.actions}>
          {user === null || user === undefined ? (
            <AppLink {...loginLink} className={styles.account}>
              <IconUser />
              Войти
            </AppLink>
          ) : (
            <AppLink {...user.link} className={styles.account}>
              <IconUser />
              {user.name}
            </AppLink>
          )}

          <AppLink
            {...cartLink}
            className={styles.cart}
            aria-label={`Корзина, товаров: ${cartCount}`}
          >
            <IconCart />
            {cartCount > 0 && (
              <span className={styles.cartCount} aria-hidden={true}>
                {cartCount}
              </span>
            )}
          </AppLink>

          {onMenuClick !== undefined && (
            <IconButton
              className={styles.menuButton}
              icon={<IconMenu />}
              label="Открыть меню"
              variant="ghost"
              onClick={onMenuClick}
            />
          )}
        </div>
      </div>
    </Container>

    {notice !== undefined && <div className={styles.notice}>{notice}</div>}
  </header>
)
