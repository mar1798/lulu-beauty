import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from 'motion/react'
import {
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { IBasicStyling, ISelectOption, ISelectProps } from '../../types'
import { IconCheck, IconChevronDown } from '../../svg/icons'
import { Portal } from '../portal'
import { POPOVER_OFFSET, POPOVER_TRANSITION } from '../../utils/motion'
import * as styles from './Select.css'

/**
 * Выпадающий список: категория товара, статус заявки, фильтры каталога.
 *
 * Собран на кнопке и `role="listbox"`, а не на нативном `<select>`: нативный
 * список рисует операционная система, и ни радиус, ни шрифт, ни подсветка
 * выбранного к остальным полям формы не приводятся — на десктопе он выпадал
 * из оформления единственным «системным» элементом.
 *
 * Взамен всё, что нативный контрол давал бесплатно, сделано руками по схеме
 * ARIA APG «select-only combobox»:
 *
 * - фокус **не** уходит в список, а остаётся на кнопке, и активная строка
 *   помечается `aria-activedescendant` — поэтому не нужны ни ловушка фокуса,
 *   ни возврат фокуса при закрытии, и Tab всегда уводит на следующее поле;
 * - стрелки/Home/End водят по списку, Enter выбирает, Escape закрывает,
 *   а набор букв ищет строку по началу подписи — как в нативном списке;
 * - `name` продолжает уходить в форму — скрытым `input`.
 *
 * Список рендерится порталом: `StatusSelect` стоит в строке админской
 * таблицы с горизонтальной прокруткой, и в потоке его бы обрезало.
 */

/** Отступ списка от поля. */
const ANCHOR_GAP = 6

/** Запас до края окна, чтобы список не прилипал к нему вплотную. */
const VIEWPORT_MARGIN = 8

/** Потолок высоты списка: дальше он превращается в самостоятельную страницу. */
const MAX_HEIGHT = 288

/** Сколько миллисекунд набранные буквы считаются одним поисковым запросом. */
const TYPEAHEAD_RESET_MS = 500

export interface IAnchor {
  /** Куда раскрылся список — вниз от поля или вверх. */
  placement: 'top' | 'bottom'
  style: CSSProperties
}

/** Координаты списка по прямоугольнику поля. Экспортируется ради тестов. */
export const anchorTo = (trigger: HTMLElement): IAnchor => {
  const rect = trigger.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN
  const above = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN

  /*
    Вниз — пока внизу помещается хотя бы столько же, сколько наверху: список
    у нижнего края экрана должен раскрываться вверх, а не прижиматься к нему
    полоской в две строки.
  */
  const isBelow = below >= Math.min(MAX_HEIGHT, above)
  const available = isBelow ? below : above

  return {
    placement: isBelow ? 'bottom' : 'top',
    style: {
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(0, Math.min(MAX_HEIGHT, available)),
      ...(isBelow
        ? { top: rect.bottom + ANCHOR_GAP }
        : { bottom: window.innerHeight - rect.top + ANCHOR_GAP }),
    },
  }
}

/** Ближайшая доступная строка в заданном направлении; `-1`, если таких нет. */
const seek = (options: ISelectOption[], from: number, step: number): number => {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (options[index].disabled !== true) {
      return index
    }
  }

  return -1
}

const firstEnabled = (options: ISelectOption[]): number => seek(options, 0, 1)

const lastEnabled = (options: ISelectOption[]): number => seek(options, options.length - 1, -1)

export const Select: FC<ISelectProps & IBasicStyling> = ({
  value,
  onChange,
  options,
  id,
  name,
  label,
  ariaLabel,
  hint,
  error,
  placeholder,
  disabled = false,
  required = false,
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId = `${fieldId}-label`
  const listboxId = `${fieldId}-listbox`
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const optionId = (index: number): string => `${fieldId}-option-${index}`

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)
  const typeahead = useRef({ query: '', at: 0 })

  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [anchor, setAnchor] = useState<IAnchor | null>(null)

  const isReduced = useReducedMotion() ?? false
  const hasError = error !== undefined && error !== null && error !== ''

  /*
    Заглушка — такая же строка списка, как остальные, а не отдельное
    состояние: у обязательного поля она заблокирована (сбросить выбор нельзя),
    у необязательного ею выбор как раз сбрасывается — ровно то, на что
    рассчитывают `AdminProductForm` («Без категории») и фильтры каталога.
  */
  const items = useMemo<ISelectOption[]>(
    () =>
      placeholder === undefined || options.some(option => option.value === '')
        ? options
        : [{ value: '', label: placeholder, disabled: required }, ...options],
    [options, placeholder, required]
  )

  const selectedIndex = items.findIndex(option => option.value === value)
  const selected = selectedIndex === -1 ? null : items[selectedIndex]

  const describedBy =
    [hasError ? errorId : null, hint !== undefined ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  const reanchor = useCallback(() => {
    if (triggerRef.current !== null) {
      setAnchor(anchorTo(triggerRef.current))
    }
  }, [])

  const open = useCallback(
    (index: number) => {
      if (disabled) {
        return
      }

      reanchor()
      setActiveIndex(index)
      setIsOpen(true)
    },
    [disabled, reanchor]
  )

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  const commit = useCallback(
    (index: number) => {
      const option = items[index]

      if (option === undefined || option.disabled === true) {
        return
      }

      close()

      if (option.value !== value) {
        onChange(option.value)
      }
    },
    [items, value, onChange, close]
  )

  /** Первая позиция при раскрытии: выбранная строка, иначе первая доступная. */
  const entryIndex = (): number =>
    selectedIndex !== -1 && items[selectedIndex].disabled !== true
      ? selectedIndex
      : firstEnabled(items)

  const move = (step: number): void => {
    const from = activeIndex === -1 ? (step > 0 ? 0 : items.length - 1) : activeIndex + step
    const next = seek(items, Math.max(0, Math.min(items.length - 1, from)), step)

    if (next !== -1) {
      setActiveIndex(next)
    }
  }

  /** Поиск по первым буквам — как в нативном списке. */
  const runTypeahead = (char: string): void => {
    const now = Date.now()
    const query =
      now - typeahead.current.at > TYPEAHEAD_RESET_MS
        ? char.toLowerCase()
        : typeahead.current.query + char.toLowerCase()

    typeahead.current = { query, at: now }

    const found = items.findIndex(
      option => option.disabled !== true && option.label.toLowerCase().startsWith(query)
    )

    if (found === -1) {
      return
    }

    if (isOpen) {
      setActiveIndex(found)
    } else {
      commit(found)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()

        if (isOpen) {
          move(event.key === 'ArrowDown' ? 1 : -1)
        } else {
          open(entryIndex())
        }

        return
      }

      case 'Home':
      case 'End': {
        event.preventDefault()

        const edge = event.key === 'Home' ? firstEnabled(items) : lastEnabled(items)

        if (isOpen) {
          setActiveIndex(edge)
        } else {
          open(edge)
        }

        return
      }

      case 'Enter':
      case ' ': {
        event.preventDefault()

        if (isOpen) {
          commit(activeIndex)
        } else {
          open(entryIndex())
        }

        return
      }

      case 'Escape': {
        if (isOpen) {
          // Пока список открыт, Escape закрывает его, а не форму вокруг.
          event.stopPropagation()
          event.preventDefault()
          close()
        }

        return
      }

      case 'Tab': {
        // Уходим на следующее поле, но список за собой не оставляем.
        close()

        return
      }

      default: {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          runTypeahead(event.key)
        }
      }
    }
  }

  /*
    Прокрутка и смена размера окна не закрывают список, а пересчитывают его
    положение: закрытие на скролл раздражает на тач-устройствах, где список
    листают тем же жестом. `capture` — потому что прокручивается обычно не
    окно, а контейнер под ним (таблица админки).
  */
  useEffect(() => {
    if (!isOpen) {
      return
    }

    window.addEventListener('scroll', reanchor, { capture: true, passive: true })
    window.addEventListener('resize', reanchor)

    return () => {
      window.removeEventListener('scroll', reanchor, { capture: true })
      window.removeEventListener('resize', reanchor)
    }
  }, [isOpen, reanchor])

  /** Клик мимо поля и списка закрывает; `mousedown`, чтобы успеть до фокуса. */
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null

      if (target === null) {
        close()

        return
      }

      /*
        Список — тоже «внутри», хотя порталом он лежит в другом месте DOM:
        `mousedown` по строке всплывает сюда же. Без этой проверки нажатие по
        любой строке сначала закрывало список, и выбор доезжал только потому,
        что `AnimatePresence` доигрывал исчезновение и `click` успевал попасть
        по ещё живому `li`; по заблокированной строке (заглушка обязательного
        поля) список просто закрывался, хотя трогать её нельзя вовсе.
      */
      if (
        triggerRef.current?.contains(target) === true ||
        popoverRef.current?.contains(target) === true
      ) {
        return
      }

      close()
    }

    document.addEventListener('mousedown', onPointerDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isOpen, close])

  /**
   * Активная строка всегда в видимой части списка — иначе стрелки уводят
   * «в никуда». Проверка на метод нужна для jsdom: там `scrollIntoView`
   * не реализован, а ронять из-за прокрутки тесты не за что.
   */
  useEffect(() => {
    const active = activeRef.current

    if (typeof active?.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen])

  /*
    Раскрытие — одной строкой `transform`, а не парой `y`/`scale`: так Motion
    отдаёт анимацию в WAAPI и она не считается на главном потоке (см.
    best-practices в скилле `motion`). Список «вырастает» из поля, поэтому
    сдвиг зависит от того, вниз он раскрылся или вверх.
  */
  const shown: TargetAndTransition = isReduced
    ? { opacity: 1 }
    : { opacity: 1, transform: 'translateY(0px) scale(1)' }

  const hidden = (placement: IAnchor['placement']): TargetAndTransition => {
    const shift = placement === 'bottom' ? -POPOVER_OFFSET : POPOVER_OFFSET

    return isReduced
      ? { opacity: 0 }
      : { opacity: 0, transform: `translateY(${shift}px) scale(0.97)` }
  }

  return (
    <div className={clsx(styles.container, className)}>
      {label !== undefined && (
        <label className={styles.label} id={labelId} htmlFor={fieldId}>
          {label}
        </label>
      )}

      <div className={styles.shell}>
        <button
          ref={triggerRef}
          type="button"
          id={fieldId}
          className={clsx(styles.control, hasError && styles.invalid)}
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && activeIndex !== -1 ? optionId(activeIndex) : undefined}
          aria-label={label === undefined ? ariaLabel : undefined}
          aria-invalid={hasError}
          aria-required={required}
          aria-describedby={describedBy}
          onKeyDown={onKeyDown}
          onClick={() => {
            if (isOpen) {
              close()
            } else {
              open(entryIndex())
            }
          }}
        >
          <span className={clsx(styles.value, selected === null && styles.placeholder)}>
            {selected?.label ?? placeholder ?? ''}
          </span>
        </button>

        <IconChevronDown className={styles.chevron} />
      </div>

      {/* Значение по-прежнему уходит в форму под своим `name`, как у нативного поля. */}
      {name !== undefined && <input type="hidden" name={name} value={value} />}

      <Portal>
        <AnimatePresence>
          {isOpen && anchor !== null && (
            <motion.div
              ref={popoverRef}
              className={clsx(styles.popover, styles.origin[anchor.placement])}
              style={anchor.style}
              initial={hidden(anchor.placement)}
              animate={shown}
              exit={hidden(anchor.placement)}
              transition={POPOVER_TRANSITION}
              /*
                Фокус живёт на кнопке всё время, пока список открыт: без этого
                клик по строке уводил бы его в `body`, и `aria-activedescendant`
                перестал бы что-либо значить.
              */
              onMouseDown={event => event.preventDefault()}
            >
              <ul
                className={styles.list}
                id={listboxId}
                role="listbox"
                aria-labelledby={label === undefined ? undefined : labelId}
                aria-label={label === undefined ? ariaLabel : undefined}
              >
                {items.map((option, index) => {
                  const isSelected = option.value === value
                  const isActive = index === activeIndex
                  const isDisabled = option.disabled === true

                  return (
                    <li
                      key={option.value}
                      ref={isActive ? activeRef : undefined}
                      id={optionId(index)}
                      className={clsx(
                        styles.option,
                        isActive && styles.active,
                        isSelected && styles.selected,
                        isDisabled && styles.disabled
                      )}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isDisabled}
                      onMouseMove={() => {
                        if (!isDisabled && !isActive) {
                          setActiveIndex(index)
                        }
                      }}
                      onClick={() => commit(index)}
                    >
                      <span className={styles.optionLabel}>{option.label}</span>
                      {isSelected && <IconCheck className={styles.check} />}
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {hasError ? (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      ) : (
        hint !== undefined && (
          <span className={styles.hint} id={hintId}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}
