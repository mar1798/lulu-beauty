import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type FC, useEffect } from 'react'
import type { IBasicStyling, IMobileMenuProps } from '../../types'
import { IconCart, IconClose, IconUser } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Portal } from '../../atoms/portal'
import { Text } from '../../atoms/text'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import { DIALOG_TRANSITION, OVERLAY_TRANSITION } from '../../utils/motion'
import * as styles from './MobileMenu.css'

/**
 * Навигация на узких экранах: панель выезжает из-под шапки сверху вниз.
 *
 * Сверху, а не сбоку, потому что открывает её кнопка в шапке — панель
 * приходит оттуда же, куда человек нажал.
 *
 * Ловушка фокуса, Escape и блокировка прокрутки — те же, что у `Modal`:
 * разделять их незачем, панель ведёт себя как диалог. `role="dialog"` с
 * `aria-modal` нужен, чтобы скринридер не читал страницу под панелью.
 *
 * Закрывается сама на широком экране: если панель открыли на телефоне и
 * повернули его, кнопка меню исчезает вместе с брейкпоинтом — без этого
 * фокус остался бы заперт в невидимой панели.
 */

/** Тот же `lg`, на котором в шапке появляется обычная навигация. */
const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

export const MobileMenu: FC<IMobileMenuProps & IBasicStyling> = ({
  isOpen,
  onClose,
  navigation,
  user,
  loginLink,
  registerLink,
  cartLink,
  cartCount = 0,
  currentHref,
  footer,
  className,
}) => {
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen)
  const isReduced = useReducedMotion() ?? false

  useLockBodyScroll(isOpen)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const wideScreen = window.matchMedia(WIDE_SCREEN_QUERY)
    const onWiden = (): void => {
      if (wideScreen.matches) {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    wideScreen.addEventListener('change', onWiden)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      wideScreen.removeEventListener('change', onWiden)
    }
  }, [isOpen, onClose])

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={clsx(styles.overlay, className)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_TRANSITION}
            onMouseDown={event => {
              /*
                Как в `Modal`: закрываем по нажатию на самом фоне, а не по клику,
                иначе выделение текста внутри панели закрывало бы её.
              */
              if (event.target === event.currentTarget) {
                onClose()
              }
            }}
          >
            <motion.div
              ref={panelRef}
              className={styles.panel}
              role="dialog"
              aria-modal={true}
              aria-label="Меню"
              tabIndex={-1}
              initial={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-100%)' }}
              animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0%)' }}
              exit={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-100%)' }}
              transition={DIALOG_TRANSITION}
            >
              <div className={styles.head}>
                <Text size="sm" weight="medium" tone="muted">
                  Меню
                </Text>

                <IconButton
                  icon={<IconClose />}
                  label="Закрыть меню"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                />
              </div>

              <nav className={styles.nav} aria-label="Основная навигация">
                {navigation.map(item => (
                  <AppLink
                    key={item.link.href}
                    {...item.link}
                    className={styles.navLink}
                    aria-current={item.link.href === currentHref ? 'page' : undefined}
                    onClick={onClose}
                  >
                    {item.label}
                  </AppLink>
                ))}

                <AppLink {...cartLink} className={styles.navLink} onClick={onClose}>
                  <span className={styles.rowWithIcon}>
                    <IconCart />
                    Корзина
                  </span>
                  {cartCount > 0 && <span className={styles.count}>{cartCount}</span>}
                </AppLink>
              </nav>

              <div className={styles.account}>
                {user === null || user === undefined ? (
                  <>
                    <AppLink {...loginLink} className={styles.navLink} onClick={onClose}>
                      <span className={styles.rowWithIcon}>
                        <IconUser />
                        Войти
                      </span>
                    </AppLink>

                    {registerLink !== undefined && (
                      <AppLink {...registerLink} className={styles.navLink} onClick={onClose}>
                        Зарегистрироваться
                      </AppLink>
                    )}
                  </>
                ) : (
                  <AppLink {...user.link} className={styles.navLink} onClick={onClose}>
                    <span className={styles.rowWithIcon}>
                      <IconUser />
                      {user.name}
                    </span>
                  </AppLink>
                )}

                {footer}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
