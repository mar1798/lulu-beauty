import clsx from 'clsx'
import { AnimatePresence, m, useReducedMotion, type TargetAndTransition } from 'motion/react'
import {
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  useCallback,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { IActionMenuItem, IActionMenuProps, IBasicStyling } from '../../types'
import { IconDots } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Portal } from '../../atoms/portal'
import { POPOVER_OFFSET, POPOVER_TRANSITION } from '../../utils/motion'
import * as styles from './ActionMenu.css'

/**
 * Кнопка «⋯» и меню действий строки: изменить, выключить, удалить.
 *
 * Нужна таблицам админки, где ряд из пяти иконок раздвигал строку до
 * горизонтальной прокрутки: в строке остаётся одна кнопка, а действия - с
 * подписями, которых у иконок не было.
 *
 * Схема ARIA APG «menu button»: у кнопки `aria-haspopup="menu"`, при раскрытии
 * фокус уходит в первый пункт, стрелки/Home/End водят по пунктам, Escape и Tab
 * закрывают меню и возвращают фокус на кнопку. Пункт-переход остаётся ссылкой
 * (`role="menuitem"` на самой `<a>`): его можно открыть в новой вкладке.
 *
 * Меню рендерится порталом и позиционируется `fixed`, как список `Select`:
 * таблица живёт в обёртке с `overflow`, и в потоке меню бы обрезало. Правый
 * край меню - по правому краю кнопки: она стоит у правого края строки.
 */

/** Отступ меню от кнопки. */
const ANCHOR_GAP = 6

/** Запас до края окна. */
const VIEWPORT_MARGIN = 8

/** Высота пункта и внутренний отступ панели - для оценки, влезет ли меню вниз. */
const ITEM_HEIGHT = 40
const PANEL_PADDING = 8

interface IAnchor {
  placement: 'top' | 'bottom'
  style: CSSProperties
}

const anchorTo = (trigger: HTMLElement, itemCount: number): IAnchor => {
  const rect = trigger.getBoundingClientRect()
  const height = itemCount * ITEM_HEIGHT + PANEL_PADDING
  const below = window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN
  const above = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN
  // Вниз, пока меню там помещается или наверху места не больше.
  const isBelow = below >= height || below >= above

  return {
    placement: isBelow ? 'bottom' : 'top',
    style: {
      // `clientWidth`, а не `innerWidth`: у последнего в ширину входит полоса прокрутки.
      right: Math.max(VIEWPORT_MARGIN, document.documentElement.clientWidth - rect.right),
      maxHeight: Math.max(0, isBelow ? below : above),
      ...(isBelow
        ? { top: rect.bottom + ANCHOR_GAP }
        : { bottom: window.innerHeight - rect.top + ANCHOR_GAP }),
    },
  }
}

export const ActionMenu: FC<IActionMenuProps & IBasicStyling> = ({ label, items, className }) => {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const frame = useRef<number | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [anchor, setAnchor] = useState<IAnchor | null>(null)

  const isReduced = useReducedMotion() ?? false

  /** Сама кнопка: `IconButton` ref не пробрасывает, поэтому через обёртку. */
  const triggerButton = (): HTMLButtonElement | null =>
    triggerRef.current?.querySelector('button') ?? null

  /** Пункты, доступные для фокуса, - в порядке меню. */
  const menuItems = (): HTMLElement[] =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      ) ?? []
    )

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false)

    if (returnFocus) {
      triggerRef.current?.querySelector('button')?.focus()
    }
  }, [])

  const open = (): void => {
    const trigger = triggerButton()

    if (trigger === null) {
      return
    }

    setAnchor(anchorTo(trigger, items.length))
    setIsOpen(true)
  }

  /** Фокус в первый пункт - как только меню смонтировано. */
  useEffect(() => {
    if (isOpen) {
      menuItems()[0]?.focus()
    }
  }, [isOpen])

  /*
    Прокрутка и смена размера окна перекладывают меню вслед за кнопкой, не чаще
    кадра. `capture` - прокручивается обычно не окно, а обёртка таблицы.
  */
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const reanchor = (): void => {
      if (frame.current !== null) {
        return
      }

      frame.current = requestAnimationFrame(() => {
        frame.current = null

        const trigger = triggerRef.current?.querySelector('button')

        if (trigger !== null && trigger !== undefined) {
          setAnchor(anchorTo(trigger, items.length))
        }
      })
    }

    window.addEventListener('scroll', reanchor, { capture: true, passive: true })
    window.addEventListener('resize', reanchor)

    return () => {
      window.removeEventListener('scroll', reanchor, { capture: true })
      window.removeEventListener('resize', reanchor)

      if (frame.current !== null) {
        cancelAnimationFrame(frame.current)
        frame.current = null
      }
    }
  }, [isOpen, items.length])

  /** Нажатие мимо кнопки и меню закрывает его; фокус остаётся там, куда нажали. */
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null

      if (
        target !== null &&
        (triggerRef.current?.contains(target) === true ||
          menuRef.current?.contains(target) === true)
      ) {
        return
      }

      close(false)
    }

    document.addEventListener('mousedown', onPointerDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isOpen, close])

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const list = menuItems()
    const current = list.indexOf(document.activeElement as HTMLElement)
    const focusAt = (index: number): void => {
      list[(index + list.length) % list.length]?.focus()
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        focusAt(current + 1)

        return
      }

      case 'ArrowUp': {
        event.preventDefault()
        focusAt(current - 1)

        return
      }

      case 'Home': {
        event.preventDefault()
        focusAt(0)

        return
      }

      case 'End': {
        event.preventDefault()
        focusAt(list.length - 1)

        return
      }

      case 'Escape': {
        // Escape закрывает меню, а не диалог или форму вокруг.
        event.stopPropagation()
        event.preventDefault()
        close(true)

        return
      }

      case 'Tab': {
        /*
          Меню лежит порталом в конце `body`, и Tab из него увёл бы фокус за
          подвал. Возвращаем на кнопку: следующий Tab пойдёт дальше по строке.
        */
        event.preventDefault()
        close(true)

        return
      }

      default:
    }
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    // Стрелка вниз на кнопке раскрывает меню, как Enter и пробел.
    if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault()
      open()
    }
  }

  const select = (item: IActionMenuItem): void => {
    if (item.disabled === true) {
      return
    }

    close(true)
    item.onSelect?.()
  }

  const shown: TargetAndTransition = isReduced
    ? { opacity: 1 }
    : { opacity: 1, transform: 'translateY(0px) scale(1)' }

  const hidden = (placement: IAnchor['placement']): TargetAndTransition => {
    const shift = placement === 'bottom' ? -POPOVER_OFFSET : POPOVER_OFFSET

    return isReduced
      ? { opacity: 0 }
      : { opacity: 0, transform: `translateY(${shift}px) scale(0.97)` }
  }

  const renderItem = (item: IActionMenuItem): ReactNode => {
    const isDisabled = item.disabled === true
    const classes = clsx(
      styles.item,
      item.tone === 'danger' && styles.danger,
      isDisabled && styles.disabled
    )
    const content = (
      <>
        {item.icon !== undefined && (
          <span className={styles.icon} aria-hidden={true}>
            {item.icon}
          </span>
        )}
        <span>{item.label}</span>
      </>
    )

    return (
      <li key={item.label} role="none">
        {item.link !== undefined && !isDisabled ? (
          <AppLink
            {...item.link}
            className={classes}
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setIsOpen(false)
              item.link?.onClick?.()
            }}
          >
            {content}
          </AppLink>
        ) : (
          <button
            type="button"
            className={classes}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={isDisabled ? true : undefined}
            onClick={() => {
              select(item)
            }}
          >
            {content}
          </button>
        )}
      </li>
    )
  }

  return (
    <span
      ref={triggerRef}
      className={clsx(styles.container, className)}
      onKeyDown={onTriggerKeyDown}
    >
      <IconButton
        icon={<IconDots />}
        label={label}
        size="sm"
        variant="ghost"
        hasPopup="menu"
        isExpanded={isOpen}
        onClick={() => {
          if (isOpen) {
            close(false)
          } else {
            open()
          }
        }}
      />

      <Portal>
        <AnimatePresence>
          {isOpen && anchor !== null && (
            <m.div
              className={clsx(styles.popover, styles.origin[anchor.placement])}
              style={anchor.style}
              initial={hidden(anchor.placement)}
              animate={shown}
              exit={hidden(anchor.placement)}
              transition={POPOVER_TRANSITION}
            >
              <ul
                ref={menuRef}
                className={styles.list}
                role="menu"
                aria-label={label}
                onKeyDown={onMenuKeyDown}
              >
                {items.map(renderItem)}
              </ul>
            </m.div>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  )
}
