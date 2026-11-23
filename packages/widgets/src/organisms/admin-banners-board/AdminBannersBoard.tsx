import clsx from 'clsx'
import { type FC, useState } from 'react'
import type { IAdminBannerItem, IAdminBannersBoardProps, IBasicStyling } from '../../types'
import { IconChevronDown, IconChevronUp, IconEye, IconPencil, IconTrash } from '../../svg/icons'
import { Badge } from '../../atoms/badge'
import { IconButton } from '../../atoms/icon-button'
import { Skeleton } from '../../atoms/skeleton'
import { Switch } from '../../atoms/switch'
import { VisuallyHidden } from '../../atoms/visually-hidden'
import { BANNER_KIND_LABELS, BANNER_STATE_TONES, bannerStateLabel } from '../../utils/banner'
import { formatShortDate } from '../../utils/datetime'
import * as styles from './AdminBannersBoard.css'

/**
 * Список слайдов карусели в админке: акции и свои новости в одном порядке.
 *
 * Строка - слайд: миниатюра, вид («Акция»/«Новость»), название, период, состояние
 * и управление. Состояние считает бэкенд (по строке и по часам) и показывается
 * словом и точкой, не одним цветом. Выключатель - выбор владельца «показывать в
 * карусели»: у акции он не выключает саму акцию и её скидку, у новости это
 * `isEnabled`. Состояние строки при этом может быть любым: выключенная акция
 * остаётся с прежним выбором, а в списке видно, что слайда нет из-за неё.
 *
 * Порядок - кнопками «Выше»/«Ниже», а не перетаскиванием: на телефоне
 * перетаскивание спорит с прокруткой, а с клавиатуры его нет вовсе (так же устроена
 * галерея товара). Кнопка меняет строку местами с соседней видимой и отдаёт наружу
 * весь порядок ключей - бэкенд принимает список целиком. Завершённые по умолчанию
 * скрыты: они лишь занимают место, но порядок считается по полному списку.
 *
 * Все действия - колбэки; запросы, тосты и откат при ошибке живут на странице.
 */

const DEFAULT_SKELETON_ROWS = 3

const periodOf = (item: IAdminBannerItem): string => {
  const start = item.startsAt === null ? null : formatShortDate(item.startsAt)
  const end = item.endsAt === null ? null : formatShortDate(item.endsAt)

  if (start === null && end === null) {
    return 'Без ограничений по времени'
  }

  if (start === null) {
    return `До ${end}`
  }

  return end === null ? `С ${start}, без даты окончания` : `${start} - ${end}`
}

export const AdminBannersBoard: FC<IAdminBannersBoardProps & IBasicStyling> = ({
  items,
  buildPromotionHref,
  buildNewsEditHref,
  onToggleShown,
  onReorder,
  onDeleteNews,
  isLoading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  busyKeys,
  isReordering = false,
  emptyState,
  className,
}) => {
  const [isFinishedHidden, setIsFinishedHidden] = useState(true)

  if (!isLoading && items.length === 0) {
    return <>{emptyState}</>
  }

  const visible = isFinishedHidden ? items.filter(item => item.state !== 'FINISHED') : items
  const hiddenCount = items.length - visible.length

  const move = (item: IAdminBannerItem, direction: -1 | 1): void => {
    const target = visible[visible.indexOf(item) + direction] as IAdminBannerItem | undefined

    if (target === undefined) {
      return
    }

    const keys = items.map(entry => entry.key)
    const from = keys.indexOf(item.key)
    const to = keys.indexOf(target.key)

    keys[from] = target.key
    keys[to] = item.key
    onReorder(keys)
  }

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.toolbar}>
        <Switch
          label="Скрывать завершённые"
          checked={isFinishedHidden}
          onChange={setIsFinishedHidden}
        />
        {hiddenCount > 0 && <p className={styles.note}>Скрыто завершённых: {hiddenCount}</p>}
      </div>

      <p className={styles.note}>
        Скидка акции работает независимо от показа в карусели: скрытая акция остаётся действующей.
      </p>

      <ul className={styles.list} aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: skeletonRows }, (_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>
                <Skeleton height={96} shape="block" />
              </li>
            ))
          : visible.map((item, index) => {
              const isBusy = busyKeys?.has(item.key) ?? false
              const isMoveBlocked = isBusy || isReordering
              const stateLabel = bannerStateLabel(item.kind, item.state)
              const isNews = item.kind === 'NEWS'

              return (
                <li
                  key={item.key}
                  className={clsx(styles.row, item.state !== 'SHOWN' && styles.rowMuted)}
                >
                  <div className={styles.thumb}>
                    {item.slide.imageMobileUrl === null ? (
                      <span className={styles.thumbText}>Текст</span>
                    ) : (
                      <img
                        className={styles.thumbImage}
                        src={item.slide.imageMobileUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </div>

                  <div className={styles.main}>
                    <div className={styles.heading}>
                      <Badge tone={isNews ? 'accent' : 'brand'}>
                        {BANNER_KIND_LABELS[item.kind]}
                      </Badge>
                      <Badge tone={BANNER_STATE_TONES[item.state]} withDot={true}>
                        {stateLabel}
                      </Badge>
                    </div>
                    <p className={styles.title} title={item.slide.title}>
                      {item.slide.title}
                    </p>
                    <span className={styles.period}>{periodOf(item)}</span>
                  </div>

                  <div className={styles.controls}>
                    <Switch
                      label={
                        <>
                          Показывать в карусели
                          <VisuallyHidden>{`: ${item.slide.title}`}</VisuallyHidden>
                        </>
                      }
                      checked={item.isShown}
                      disabled={isBusy}
                      onChange={next => {
                        onToggleShown(item, next)
                      }}
                    />

                    <div className={styles.actions}>
                      <IconButton
                        icon={<IconChevronUp />}
                        label={`Выше: ${item.slide.title}`}
                        size="sm"
                        variant="ghost"
                        disabled={isMoveBlocked || index === 0}
                        onClick={() => {
                          move(item, -1)
                        }}
                      />
                      <IconButton
                        icon={<IconChevronDown />}
                        label={`Ниже: ${item.slide.title}`}
                        size="sm"
                        variant="ghost"
                        disabled={isMoveBlocked || index === visible.length - 1}
                        onClick={() => {
                          move(item, 1)
                        }}
                      />

                      {isNews ? (
                        <>
                          <IconButton
                            icon={<IconPencil />}
                            label={`Изменить: ${item.slide.title}`}
                            size="sm"
                            variant="ghost"
                            link={{ href: buildNewsEditHref(item) }}
                          />
                          <IconButton
                            icon={<IconTrash />}
                            label={`Удалить: ${item.slide.title}`}
                            size="sm"
                            variant="dangerSoft"
                            disabled={isBusy}
                            onClick={() => {
                              onDeleteNews(item)
                            }}
                          />
                        </>
                      ) : (
                        <IconButton
                          icon={<IconEye />}
                          label={`Открыть акцию: ${item.slide.title}`}
                          size="sm"
                          variant="ghost"
                          link={{ href: buildPromotionHref(item) }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
      </ul>
    </div>
  )
}
