import clsx from 'clsx'
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from 'motion/react'
import {
  Fragment,
  type FC,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type {
  IBasicStyling,
  IHeaderSearchProps,
  ISearchSuggestGroup,
  ISearchSuggestItem,
} from '../../types'
import { IconBox, IconClose, IconSearch } from '../../svg/icons'
import { AppImage } from '../../atoms/app-image'
import { AppLink } from '../../atoms/app-link'
import { IconButton } from '../../atoms/icon-button'
import { Portal } from '../../atoms/portal'
import { Price } from '../../atoms/price'
import { Spinner } from '../../atoms/spinner'
import { Text } from '../../atoms/text'
import { anchorTo, type IAnchor } from '../../atoms/select'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll'
import {
  DIALOG_TRANSITION,
  OVERLAY_TRANSITION,
  POPOVER_OFFSET,
  POPOVER_TRANSITION,
} from '../../utils/motion'
import * as styles from './HeaderSearch.css'

/**
 * Универсальный поиск в шапке: одно поле на товары, бренды и категории.
 *
 * Полностью презентационный, как и сама шапка. Он не ищет и не ходит в API —
 * сайт присылает уже сгруппированные подсказки (`groups`) и готовые адреса,
 * потому что виджету неоткуда знать ни маршрутов, ни того, что категория
 * фильтруется слагом, а бренд — полным названием.
 *
 * Дебаунс тоже снаружи (`useDebouncedValue`) — по той же причине, что у
 * `SearchField`: решать, когда бить в API, должен тот, кто этот запрос делает.
 *
 * Группы, а не один список: категория и бренд ведут в каталог с фильтром, а
 * товар — на свою страницу, и смешать их значило бы спрятать две дешёвые
 * точные подсказки под тем, что просто оказалось первым по алфавиту.
 *
 * Разметка — ARIA APG «combobox with list autocomplete», та же схема, что у
 * `Combobox`: фокус не уходит из поля, активная строка помечается
 * `aria-activedescendant`. Отличие одно, и оно важное: строки здесь ссылки, а
 * не `option`-ы с обработчиком. Мышью строка открывается сама (и средней
 * кнопкой, и в новой вкладке), а с клавиатуры переход делает сайт через
 * `onSelect` — роутер живёт у него.
 *
 * Две раскладки, и это одно и то же состояние в двух видах:
 *
 * - **широкий экран** — поле стоит в строке шапки, выдача висит порталом над
 *   страницей, как у `Combobox` (шапка полупрозрачная и с `backdrop-filter`,
 *   а такой предок создаёт свой контекст наложения, из которого никакой
 *   `z-index` дочернего блока уже не выбирается);
 * - **узкий** — в строке шапки только лупа: логотип, корзина и бургер заняли
 *   всю ширину. Лупа открывает панель ровно такую же, как бургер открывает
 *   `MobileMenu`, и поле вместе с выдачей живут уже в ней. Панель — диалог с
 *   ловушкой фокуса, Escape и блокировкой прокрутки; выдача внутри неё идёт
 *   потоком, без портала и без привязки к координатам поля, потому что
 *   всплывающий список над клавиатурой телефона показывать негде.
 */

/** Тот же `lg`, на котором в шапке появляется поле вместо лупы. */
const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

/** Плоский список строк в порядке обхода стрелками. */
const flatten = (
  groups: ISearchSuggestGroup[] | null,
  allResults: ISearchSuggestItem | null
): ISearchSuggestItem[] => {
  const items = (groups ?? []).flatMap(group => group.items)

  return allResults === null ? items : [...items, allResults]
}

export const HeaderSearch: FC<IHeaderSearchProps & IBasicStyling> = ({
  value,
  onChange,
  groups,
  allResults,
  isBusy = false,
  onSubmit,
  onSelect,
  placeholder = 'Поиск: товар, бренд, категория',
  expandLabel = 'Найти товар',
  maxLength = 255,
  contact,
  className,
}) => {
  const fieldId = useId()

  const barInputRef = useRef<HTMLInputElement>(null)
  const drawerInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  /*
    Контейнер с прокруткой — свой у каждой раскладки, и это не дублирование.
    Один общий реф затирался бы при закрытии: попап уходит с анимацией, и его
    ref-колбэк приходит с `null` уже после того, как открывшаяся панель записала
    туда себя, — прокрутка к активной строке в панели молча переставала работать.
  */
  const popoverScrollRef = useRef<HTMLDivElement>(null)
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)
  /** Прокрутка к активной строке разрешена только после хода с клавиатуры. */
  const shouldScrollToActive = useRef(false)

  const [isOpen, setIsOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [anchor, setAnchor] = useState<IAnchor | null>(null)

  const isReduced = useReducedMotion() ?? false

  /* Открытая панель бесполезна без фокуса в поле — печатать начинают сразу,
     а первой в обходе стоит кнопка закрытия. */
  const panelRef = useFocusTrap<HTMLDivElement>(isDrawerOpen, drawerInputRef)
  useLockBodyScroll(isDrawerOpen)

  const allResultsItem: ISearchSuggestItem | null =
    allResults === undefined
      ? null
      : { id: '__all__', label: allResults.label, link: allResults.link }
  const items = flatten(groups, allResultsItem)
  /* Пустой массив групп — это ответ «не нашли», и его надо показать; `null` —
     что подсказок ещё не спрашивали, и показывать нечего. */
  const hasAnswer = groups !== null

  const reanchor = useCallback(() => {
    if (shellRef.current !== null) {
      setAnchor(anchorTo(shellRef.current))
    }
  }, [])

  const open = useCallback(() => {
    reanchor()
    setIsOpen(true)
  }, [reanchor])

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    /* И состояние выпадающего списка заодно: оно копится, пока печатают в
       панели, и переживи оно её закрытие — на телефоне попап раскрылся бы
       по координатам поля, которого там нет (`display: none` даёт нули). */
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  /**
   * Строку выбрали — значит, уходим со страницы: закрывается и список, и
   * панель. Вернувшись назад, человек не должен обнаружить поверх шапки
   * поиск, которого он не открывал.
   */
  const dismiss = useCallback(() => {
    close()
    setIsDrawerOpen(false)
  }, [close])

  /** Перевод активной строки клавишей: единственный случай, когда список едет. */
  const moveActive = (index: number): void => {
    shouldScrollToActive.current = true
    setActiveIndex(index)
  }

  const move = (step: number): void => {
    if (items.length === 0) {
      return
    }

    /*
      `-1` — «ничего не выделено», и это рабочее состояние, а не край: с него
      Enter отправляет набранное целиком. Поэтому обход замыкается через него,
      иначе из списка нельзя было бы выйти стрелками.
    */
    const next = activeIndex + step

    moveActive(next < -1 ? items.length - 1 : next >= items.length ? -1 : next)
  }

  /** В панели список виден всегда — «раскрытость» там не состояние, а факт. */
  const isListShown = isDrawerOpen ? hasAnswer : isOpen && hasAnswer

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()

        if (isListShown) {
          move(event.key === 'ArrowDown' ? 1 : -1)
        } else {
          if (!isDrawerOpen) {
            open()
          }

          moveActive(event.key === 'ArrowDown' ? 0 : items.length - 1)
        }

        return
      }

      case 'Enter': {
        const active = activeIndex === -1 ? undefined : items[activeIndex]

        event.preventDefault()
        dismiss()

        if (active === undefined) {
          onSubmit?.()
        } else {
          onSelect?.(active)
        }

        return
      }

      case 'Escape': {
        // Набранное остаётся: стирать его Escape не просили. В панели уходит
        // сама панель — списка без неё там не бывает.
        if (isDrawerOpen) {
          event.stopPropagation()
          event.preventDefault()
          closeDrawer()
        } else if (isOpen) {
          event.stopPropagation()
          event.preventDefault()
          close()
        }

        return
      }

      case 'Tab': {
        // Из панели Tab не выпускает (ловушка фокуса), и закрывать её нечему.
        if (!isDrawerOpen) {
          close()
        }

        return
      }
    }
  }

  /* Прокрутка и смена размера окна список не закрывают, а пересчитывают его
     положение — как у `Combobox` и `Select`. */
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

  /**
   * Панель закрывается сама на широком экране — ровно как `MobileMenu`: лупа,
   * которой её открыли, исчезает вместе с брейкпоинтом, и без этого фокус
   * остался бы заперт в невидимой панели. Заодно Escape на уровне документа:
   * фокус может стоять и на строке списка, а не только в поле.
   */
  useEffect(() => {
    if (!isDrawerOpen) {
      return
    }

    const onDocumentKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeDrawer()
      }
    }

    const wideScreen = window.matchMedia(WIDE_SCREEN_QUERY)
    const onWiden = (): void => {
      if (wideScreen.matches) {
        closeDrawer()
      }
    }

    document.addEventListener('keydown', onDocumentKeyDown)
    wideScreen.addEventListener('change', onWiden)

    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown)
      wideScreen.removeEventListener('change', onWiden)
    }
  }, [isDrawerOpen, closeDrawer])

  /** Ответ пришёл короче прежнего — подсветка не должна висеть за его пределами. */
  useEffect(() => {
    setActiveIndex(current => (current >= items.length ? -1 : current))
  }, [items.length])

  /**
   * Прокрутка к активной строке — только после хода с клавиатуры: строку
   * переставляет ещё и мышь, и иначе список уезжал бы под курсором.
   * Прокручивается сам контейнер, а не `scrollIntoView`, который вправе
   * подвинуть и предков — то есть страницу под порталом.
   */
  useEffect(() => {
    const active = activeRef.current
    const host = isDrawerOpen ? panelScrollRef.current : popoverScrollRef.current

    if (!shouldScrollToActive.current || active === null || host === null) {
      return
    }

    shouldScrollToActive.current = false

    const top = active.offsetTop
    const bottom = top + active.offsetHeight

    if (top < host.scrollTop) {
      host.scrollTop = top
    } else if (bottom > host.scrollTop + host.clientHeight) {
      host.scrollTop = bottom - host.clientHeight
    }
  }, [activeIndex, isListShown, isDrawerOpen])

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

  /**
   * Поле. Одно и то же и в шапке, и в панели, но в разметке присутствует в
   * двух экземплярах, поэтому у каждого свой набор идентификаторов: два
   * `id` подряд сломали бы и `aria-controls`, и `aria-activedescendant`.
   * Видим при этом всегда ровно один — второй убран `display: none` по
   * брейкпоинту, то есть и из дерева доступности тоже.
   */
  const field = (scope: 'bar' | 'drawer'): ReactElement => {
    const inputId = `${fieldId}-${scope}`
    const listboxId = `${inputId}-listbox`
    const isListed = scope === 'drawer' ? isDrawerOpen && hasAnswer : isOpen && hasAnswer

    return (
      <div
        ref={scope === 'bar' ? shellRef : undefined}
        className={styles.shell}
        data-open={isListed}
      >
        <span className={styles.icon}>
          {isBusy ? (
            /* «Загрузку» объявляет сам список (`aria-busy`) — здесь молча. */
            <Spinner size="sm" label={null} />
          ) : (
            <IconSearch />
          )}
        </span>

        <input
          ref={scope === 'drawer' ? drawerInputRef : barInputRef}
          id={inputId}
          className={styles.input}
          type="search"
          role="combobox"
          value={value}
          placeholder={placeholder}
          /* Столько же принимает ручка подсказок: без ограничения запрос
             подлиннее возвращал 422, а подсказки просто молча переставали
             приходить. */
          maxLength={maxLength}
          aria-label={placeholder}
          /* Браузерная автоподстановка перекрыла бы наш список своим. */
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isListed}
          aria-controls={listboxId}
          aria-activedescendant={
            isListed && activeIndex !== -1 ? `${inputId}-option-${activeIndex}` : undefined
          }
          onChange={event => {
            onChange(event.target.value)
            /* Набор меняет выдачу — подсветка сбрасывается, иначе Enter выбрал
               бы строку, которая просто оказалась на том же месте. */
            setActiveIndex(-1)

            /* В панели список и так открыт; поднимать заодно попап шапки нельзя —
               он останется поднятым и после её закрытия. */
            if (scope === 'bar') {
              open()
            }
          }}
          /* В панели список открыт сам по себе — фокус ему ничего не сообщает. */
          onFocus={scope === 'bar' ? open : undefined}
          onKeyDown={onKeyDown}
        />

        {value !== '' && (
          <IconButton
            className={styles.clear}
            size="sm"
            variant="ghost"
            icon={<IconClose />}
            label="Очистить поиск"
            /* Фокус остаётся в поле: очистка — не уход из него. */
            onClick={() => {
              onChange('')

              if (scope === 'bar') {
                close()
              }

              ;(scope === 'drawer' ? drawerInputRef : barInputRef).current?.focus()
            }}
          />
        )}
      </div>
    )
  }

  /**
   * Выдача. Плоский список с заголовками-разделителями, а не вложенные `ul`:
   * группа здесь — только подпись над строками, и лишний уровень вложенности
   * скринридер читал бы как второй список.
   */
  const list = (scope: 'bar' | 'drawer'): ReactElement => {
    const optionId = (index: number): string => `${fieldId}-${scope}-option-${index}`
    /** Сквозной номер строки в плоском списке — по нему же идёт подсветка. */
    let cursor = -1

    const row = (item: ISearchSuggestItem, isLast: boolean): ReactElement => {
      cursor += 1
      const index = cursor
      const isActive = index === activeIndex

      return (
        <li
          key={item.id}
          ref={isActive ? activeRef : undefined}
          id={optionId(index)}
          role="option"
          aria-selected={isActive}
          className={clsx(styles.option, isActive && styles.active, isLast && styles.allResults)}
          onMouseMove={() => {
            if (!isActive) {
              setActiveIndex(index)
            }
          }}
        >
          <AppLink {...item.link} className={styles.row} onClick={dismiss}>
            {!isLast && (
              <span className={styles.thumb}>
                {item.image === undefined ? (
                  <IconBox className={styles.thumbPlaceholder} />
                ) : (
                  <AppImage image={item.image} sizes={{ fb: 40 }} fill={true} />
                )}
              </span>
            )}

            <span className={styles.text}>
              <span className={styles.label}>{item.label}</span>
              {item.hint !== undefined && <span className={styles.hint}>{item.hint}</span>}
            </span>

            {item.priceCents !== undefined && (
              <span className={styles.price}>
                <Price priceCents={item.priceCents} size="sm" />
                {item.isUnavailable === true && <span className={styles.stock}>нет в наличии</span>}
              </span>
            )}
          </AppLink>
        </li>
      )
    }

    return (
      <>
        <ul
          className={styles.list}
          id={`${fieldId}-${scope}-listbox`}
          role="listbox"
          aria-label={placeholder}
          /* Обещание из комментария к спиннеру: озвучивает загрузку список,
             поэтому у самого спиннера подписи нет. */
          aria-busy={isBusy}
        >
          {(groups ?? []).map(group => (
            <Fragment key={group.title}>
              <li className={styles.groupTitle} role="presentation">
                {group.title}
              </li>
              {group.items.map(item => row(item, false))}
            </Fragment>
          ))}

          {allResultsItem !== null && row(allResultsItem, true)}
        </ul>

        {/* «Не нашлось» — про ответ, а не про число строк: «показать всё» при пустых
            группах оставило бы одинокую строку вместо объяснения. */}
        {(groups ?? []).every(group => group.items.length === 0) && (
          <div className={styles.empty}>
            <p>Извините, ничего не нашлось</p>
            {contact !== undefined && (
              <p>
                Напишите нам напрямую в{' '}
                <AppLink className={styles.emptyLink} {...contact.link}>
                  {contact.label}
                </AppLink>
              </p>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      {/* Своя кнопка, а не `IconButton`: тому нечем передать `aria-expanded`,
          а без него лупа не сообщает, что под ней открывается панель. */}
      <button
        type="button"
        className={styles.trigger}
        aria-label={expandLabel}
        aria-haspopup="dialog"
        aria-expanded={isDrawerOpen}
        onClick={() => {
          close()
          setIsDrawerOpen(true)
        }}
      >
        <IconSearch />
      </button>

      <div className={styles.field}>{field('bar')}</div>

      <Portal>
        <AnimatePresence>
          {isOpen && hasAnswer && !isDrawerOpen && anchor !== null && (
            <motion.div
              ref={node => {
                popoverRef.current = node
                popoverScrollRef.current = node
              }}
              className={clsx(styles.popover, styles.origin[anchor.placement])}
              style={anchor.style}
              initial={hidden(anchor.placement)}
              animate={shown}
              exit={hidden(anchor.placement)}
              transition={POPOVER_TRANSITION}
              /* Фокус живёт в поле всё время, пока список открыт: иначе клик по
                 строке увёл бы его в `body`, и список закрылся бы раньше, чем
                 `click` дошёл бы до ссылки. */
              onMouseDown={event => event.preventDefault()}
            >
              {list('bar')}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Панель поиска — та же раскладка, что у `MobileMenu`: затемнение с
          прижатой к верху панелью, которая приезжает оттуда же, куда нажали. */}
      <Portal>
        <AnimatePresence>
          {isDrawerOpen && (
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={OVERLAY_TRANSITION}
              onMouseDown={event => {
                /* Как в `Modal`: закрываем по нажатию на самом фоне, а не по
                   клику, иначе выделение текста внутри панели закрывало бы её. */
                if (event.target === event.currentTarget) {
                  closeDrawer()
                }
              }}
            >
              <motion.div
                ref={panelRef}
                className={styles.panel}
                role="dialog"
                aria-modal={true}
                aria-label="Поиск"
                tabIndex={-1}
                initial={
                  isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-100%)' }
                }
                animate={isReduced ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0%)' }}
                exit={isReduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-100%)' }}
                transition={DIALOG_TRANSITION}
              >
                <div className={styles.panelHead}>
                  <Text size="sm" weight="medium" tone="muted">
                    Поиск
                  </Text>

                  <IconButton
                    icon={<IconClose />}
                    label="Закрыть поиск"
                    variant="ghost"
                    size="sm"
                    onClick={closeDrawer}
                  />
                </div>

                <div className={styles.panelField}>{field('drawer')}</div>

                <div ref={panelScrollRef} className={styles.panelResults}>
                  {hasAnswer ? (
                    list('drawer')
                  ) : (
                    <p className={styles.empty}>Постараемся найти все что вы ищите</p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  )
}
