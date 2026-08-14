import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from 'motion/react'
import {
  type FC,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { IBasicStyling, IComboboxProps } from '../../types'
import { IconCheck, IconChevronDown } from '../../svg/icons'
import { Portal } from '../portal'
import { anchorTo, type IAnchor } from '../select'
import { POPOVER_OFFSET, POPOVER_TRANSITION } from '../../utils/motion'
import * as styles from './Combobox.css'

/**
 * Текстовое поле с автодополнением по уже известным значениям.
 *
 * От `Select` отличается тем, что значение не обязано быть из списка: список
 * подсказывает, а не ограничивает. Это ровно случай бренда в карточке товара —
 * своей таблицы у брендов нет, они набираются руками, но набирать заново тот,
 * что в каталоге уже есть, незачем.
 *
 * Регистр не различается **нигде**: и в поиске подсказок, и при выходе из поля.
 * Набранное «round lab» при известном «Round Lab» — это оно и есть, поэтому
 * поле само подставляет уже принятое написание (`canonical`), не дожидаясь
 * бэкенда. Иначе одно и то же значение расходилось бы на два по регистру, и
 * фильтры показывали бы половину.
 *
 * Собрано по схеме ARIA APG «combobox with list autocomplete (manual
 * selection)»: фокус остаётся в поле, активная строка помечается
 * `aria-activedescendant`. Автоподстановки в само поле нет — она затирала бы
 * набранное на каждом символе, а значение тут бывает и новым.
 *
 * Список рендерится порталом по тем же причинам, что у `Select`: поле может
 * стоять в контейнере с прокруткой, и в потоке список обрезало бы `overflow`.
 */

const fold = (value: string): string => value.trim().toLowerCase()

export const Combobox: FC<IComboboxProps & IBasicStyling> = ({
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
  maxLength,
  disabled = false,
  required = false,
  emptyLabel = 'Ничего не найдено',
  className,
}) => {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const labelId = `${fieldId}-label`
  const listboxId = `${fieldId}-listbox`
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const optionId = (index: number): string => `${fieldId}-option-${index}`

  const inputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [anchor, setAnchor] = useState<IAnchor | null>(null)

  const isReduced = useReducedMotion() ?? false
  const hasError = error !== undefined && error !== null && error !== ''
  const key = fold(value)

  /** Подсказка, совпадающая с набранным без учёта регистра, если такая есть. */
  const canonical = useMemo(
    () => options.find(option => fold(option) === key) ?? null,
    [options, key]
  )

  /**
   * Что показывать в списке.
   *
   * Пока набранное — уже целое значение из списка, показываются все подсказки,
   * а не оно одно: список тогда работает как выбор соседнего значения, что
   * ровно и нужно, когда бренд у товара меняют.
   */
  const matches = useMemo(() => {
    if (key === '' || canonical !== null) {
      return options
    }

    return options.filter(option => option.toLowerCase().includes(key))
  }, [options, key, canonical])

  const describedBy =
    [hasError ? errorId : null, hint !== undefined ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  const reanchor = useCallback(() => {
    if (shellRef.current !== null) {
      setAnchor(anchorTo(shellRef.current))
    }
  }, [])

  const open = useCallback(() => {
    if (disabled) {
      return
    }

    reanchor()
    setIsOpen(true)
  }, [disabled, reanchor])

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  const commit = (index: number): void => {
    const option = matches[index]

    if (option === undefined) {
      return
    }

    close()

    if (option !== value) {
      onChange(option)
    }
  }

  /**
   * Приведение к уже известному написанию — на выходе из поля, а не по ходу
   * набора: подменять регистр под курсором значит драться с тем, кто печатает.
   */
  const normalize = (): void => {
    if (canonical !== null && canonical !== value) {
      onChange(canonical)
    } else if (value !== value.trim()) {
      onChange(value.trim())
    }
  }

  const move = (step: number): void => {
    if (matches.length === 0) {
      return
    }

    /*
      Ничего не подсвечено — Enter отправляет набранное как есть, поэтому
      с этого состояния и начинается движение, и в него же оно возвращается
      с краёв списка: иначе из списка нельзя было бы «выйти» стрелками.
    */
    const next = activeIndex + step

    setActiveIndex(next < -1 ? matches.length - 1 : next >= matches.length ? -1 : next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()

        if (isOpen) {
          move(event.key === 'ArrowDown' ? 1 : -1)
        } else {
          open()
          setActiveIndex(event.key === 'ArrowDown' ? 0 : matches.length - 1)
        }

        return
      }

      case 'Enter': {
        if (isOpen && activeIndex !== -1) {
          // Подсвеченная строка выбирается, а форма при этом не отправляется.
          event.preventDefault()
          commit(activeIndex)

          return
        }

        // Ничего не подсвечено: набранное остаётся как есть, форма уходит.
        normalize()
        close()

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
    }
  }

  /* Прокрутка и смена размера окна не закрывают список, а пересчитывают его
     положение — как у `Select`. */
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

      if (
        target !== null &&
        (shellRef.current?.contains(target) === true ||
          popoverRef.current?.contains(target) === true)
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

  /** Набранное сузило список — подсветка не должна висеть за его пределами. */
  useEffect(() => {
    setActiveIndex(current => (current >= matches.length ? -1 : current))
  }, [matches.length])

  /**
   * Активная строка всегда в видимой части списка. Проверка на метод нужна для
   * jsdom: там `scrollIntoView` не реализован, а ронять из-за прокрутки тесты
   * не за что.
   */
  useEffect(() => {
    const active = activeRef.current

    if (typeof active?.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen])

  /*
    Раскрытие — одной строкой `transform`, чтобы Motion отдал анимацию в WAAPI
    и она не считалась на главном потоке (см. best-practices скилла `motion`).
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

      <div
        ref={shellRef}
        className={clsx(styles.shell, hasError && styles.invalid, disabled && styles.disabled)}
        data-open={isOpen}
      >
        <input
          ref={inputRef}
          id={fieldId}
          name={name}
          className={styles.input}
          type="text"
          role="combobox"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          required={required}
          /* Браузерная автоподстановка перекрыла бы наш список своим. */
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && activeIndex !== -1 ? optionId(activeIndex) : undefined}
          aria-label={label === undefined ? ariaLabel : undefined}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          onChange={event => {
            onChange(event.target.value)
            /* Набор меняет список — подсветка сбрасывается, иначе Enter выбрал
               бы строку, которая просто оказалась на том же месте. */
            setActiveIndex(-1)
            open()
          }}
          onClick={() => {
            if (!isOpen) {
              open()
            }
          }}
          onBlur={() => {
            normalize()
            close()
          }}
          onKeyDown={onKeyDown}
        />

        <button
          type="button"
          className={styles.toggle}
          disabled={disabled}
          tabIndex={-1}
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-label={isOpen ? 'Скрыть подсказки' : 'Показать подсказки'}
          /* Фокус остаётся в поле: кнопка только раскрывает список. */
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            if (isOpen) {
              close()
            } else {
              open()
            }

            inputRef.current?.focus()
          }}
        >
          <IconChevronDown />
        </button>
      </div>

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
              /* Фокус живёт в поле всё время, пока список открыт: иначе клик по
                 строке уводил бы его в `body` и `onBlur` закрыл бы список
                 раньше, чем `click` дошёл бы до строки. */
              onMouseDown={event => event.preventDefault()}
            >
              {/* Список рендерится и пустым: `aria-controls` поля ссылается на
                  него всегда, и подменять его на «ничего не найдено» значило бы
                  оставить ссылку висеть в никуда. */}
              <ul
                className={styles.list}
                id={listboxId}
                role="listbox"
                aria-labelledby={label === undefined ? undefined : labelId}
                aria-label={label === undefined ? ariaLabel : undefined}
              >
                {matches.map((option, index) => {
                  const isSelected = option === canonical
                  const isActive = index === activeIndex

                  return (
                    <li
                      key={option}
                      ref={isActive ? activeRef : undefined}
                      id={optionId(index)}
                      className={clsx(
                        styles.option,
                        isActive && styles.active,
                        isSelected && styles.selected
                      )}
                      role="option"
                      aria-selected={isSelected}
                      onMouseMove={() => {
                        if (!isActive) {
                          setActiveIndex(index)
                        }
                      }}
                      onClick={() => commit(index)}
                    >
                      <span className={styles.optionLabel}>{option}</span>
                      {isSelected && <IconCheck className={styles.check} />}
                    </li>
                  )
                })}
              </ul>

              {matches.length === 0 && <p className={styles.empty}>{emptyLabel}</p>}
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
