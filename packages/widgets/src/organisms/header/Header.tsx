import clsx from 'clsx'
import { useRef, useState, type FC } from 'react'
import { useMotionValueEvent, useScroll } from 'motion/react'
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
 *
 * Режим `isFloating` (главная): шапка лежит fixed поверх полноэкранного
 * героя без фона и границы, а с первым же пикселем прокрутки возвращает
 * обычный вид. Порог отслеживается `useScroll` + `useMotionValueEvent` —
 * никакого голого `addEventListener('scroll')`, и `setState` дёргается
 * только при пересечении порога, а не на каждый кадр.
 */

/**
 * Порог возврата фона в режиме `isFloating`. Ноль, а не высота шапки:
 * герой уезжает под шапку сразу, и любой ненулевой порог оставлял бы её
 * первые полсекунды скролла без фона поверх уже уехавшего контента.
 *
 * Сравнение строго «больше»: при инерционном оверскролле вверх на iOS
 * `scrollY` уходит в минус, и прозрачный вид должен возвращаться ровно на
 * `scrollY === 0` — то есть в самом верху страницы, а не где-то около.
 */
const SCROLL_THRESHOLD = 0

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
  isFloating = false,
  className,
}) => {
  const [isScrolled, setScrolled] = useState(false)
  const scrolledRef = useRef(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', latest => {
    if (!isFloating) {
      return
    }

    const next = latest > SCROLL_THRESHOLD

    if (next !== scrolledRef.current) {
      scrolledRef.current = next
      setScrolled(next)
    }
  })

  return (
    <header
      className={clsx(
        styles.container,
        isFloating && styles.floating,
        isFloating && isScrolled && styles.floatingScrolled,
        className,
      )}
    >
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
}
