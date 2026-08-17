import clsx from 'clsx'
import { type FC, useState } from 'react'
import type {
  IAdminCycleCalendarProps,
  IBasicStyling,
  ICycleDraft,
  IOrderCycle,
} from '../../types'
import { IconChevronLeft, IconChevronRight } from '../../svg/icons'
import { Alert } from '../../atoms/alert'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Skeleton } from '../../atoms/skeleton'
import { Text } from '../../atoms/text'
import { formatDate, formatMonth, shiftMonth, storeOffsetLabel, toStoreParts } from '../../utils/datetime'
import * as styles from './AdminCycleCalendar.css'

/**
 * Календарь дедлайнов сбора: месячная сетка плюс редактор выбранного дня.
 *
 * Все даты — календарные величины магазина (`Asia/Bishkek`), а не браузера:
 * сбор закрывается в 20:00 по Бишкеку независимо от того, откуда смотрит
 * владелец. Мгновение из API переводится в дату/время магазина через
 * `toStoreParts`, обратно — на стороне страницы через `storeIso`.
 *
 * «Активный» сбор помечается по `activeCycleId`, а не по полю `status`:
 * статус переставляет планировщик по расписанию, и сразу после создания
 * сбора он ещё `UPCOMING`, хотя покупателю тот уже отдаётся как активный.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAYS_IN_WEEK = 7
const DEFAULT_TIME = '20:00'

/**
 * Почему второй сбор не назначить. Одной строкой и в двух местах сразу: скрытой
 * подписью внутри заблокированной кнопки (иначе причину не узнает никто, кроме
 * мыши) и обычным текстом под ней.
 */
const SECOND_CYCLE_REASON =
  'Открытый сбор уже есть. Измените его дату и время вместо того, чтобы назначать второй, — ' +
  'иначе корзины покупателей останутся в первом.'

/**
 * Почему на прошедший день сбор не назначить.
 *
 * Бэкенд отказывает тем же (`deadline_must_be_future`), но уже после отправки —
 * а день в прошлом виден и здесь. Проверяется только дата: «сейчас» виджету не
 * дают, поэтому сегодняшний день с уже прошедшим временем по-прежнему остаётся
 * за бэкендом.
 */
const PAST_DAY_REASON =
  'Этот день уже прошёл. Дедлайн должен быть в будущем — иначе сбор закроется сразу.'

const STATUS_LABELS: Record<IOrderCycle['status'], string> = {
  UPCOMING: 'Запланирован',
  ACTIVE: 'Идёт',
  CLOSED: 'Закрыт',
}

interface IMonthGrid {
  /** `YYYY-MM-DD` или `null` для добивки до целых недель. */
  days: (string | null)[]
  title: string
}

const buildMonth = (month: string): IMonthGrid => {
  const first = new Date(`${month}-01T00:00:00Z`)

  if (Number.isNaN(first.getTime())) {
    return { days: [], title: '' }
  }

  const year = first.getUTCFullYear()
  const index = first.getUTCMonth()
  const total = new Date(Date.UTC(year, index + 1, 0)).getUTCDate()
  // `getUTCDay()` считает от воскресенья, а неделя в календаре начинается с понедельника.
  const offset = (first.getUTCDay() + 6) % DAYS_IN_WEEK

  const days: (string | null)[] = Array.from({ length: offset }, () => null)

  for (let day = 1; day <= total; day += 1) {
    days.push(`${month}-${String(day).padStart(2, '0')}`)
  }

  while (days.length % DAYS_IN_WEEK !== 0) {
    days.push(null)
  }

  return { days, title: formatMonth(month) }
}

export const AdminCycleCalendar: FC<IAdminCycleCalendarProps & IBasicStyling> = ({
  cycles,
  month,
  onMonthChange,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
  activeCycleId = null,
  today,
  isLoading = false,
  isBusy = false,
  error,
  className,
}) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [draft, setDraft] = useState<ICycleDraft>({ date: '', time: DEFAULT_TIME, label: '' })

  const { days, title } = buildMonth(month)

  const byDate = new Map<string, IOrderCycle[]>()

  for (const cycle of cycles) {
    const parts = toStoreParts(cycle.deadlineAt)

    if (parts === null) {
      continue
    }

    byDate.set(parts.date, [...(byDate.get(parts.date) ?? []), cycle])
  }

  const selectedCycle = selectedDate === null ? null : (byDate.get(selectedDate)?.[0] ?? null)
  const isActive = selectedCycle !== null && selectedCycle.id === activeCycleId
  /* Новый сбор на день, где сбора нет, — но открытый уже идёт где-то ещё. */
  const isSecondCycle = selectedCycle === null && activeCycleId !== null
  /*
    Только для нового сбора: у прошедшего можно править подпись, и бэкенд
    держит дату в будущем лишь у ещё открытых (`CycleService.update`).
  */
  const isPastDay =
    selectedCycle === null &&
    today !== undefined &&
    selectedDate !== null &&
    selectedDate < today

  const selectDay = (date: string): void => {
    const existing = byDate.get(date)?.[0] ?? null
    const parts = existing === null ? null : toStoreParts(existing.deadlineAt)

    setSelectedDate(date)
    setDraft({
      date,
      time: parts?.time ?? DEFAULT_TIME,
      label: existing?.label ?? '',
    })
  }

  return (
    <div className={clsx(styles.container, className)}>
      {error !== undefined && error !== null && (
        <Alert tone="danger" title="Не получилось" className={styles.alertSlot}>
          {error}
        </Alert>
      )}

      <div className={styles.calendar}>
        <div className={styles.head}>
          <IconButton
            icon={<IconChevronLeft />}
            label="Предыдущий месяц"
            size="sm"
            variant="ghost"
            onClick={() => {
              onMonthChange(shiftMonth(month, -1))
            }}
          />

          <Heading level={2} size="sm">
            {title}
          </Heading>

          <IconButton
            icon={<IconChevronRight />}
            label="Следующий месяц"
            size="sm"
            variant="ghost"
            onClick={() => {
              onMonthChange(shiftMonth(month, 1))
            }}
          />
        </div>

        {isLoading ? (
          <Skeleton height={280} shape="block" />
        ) : (
          <>
            <div className={styles.weekdays} aria-hidden={true}>
              {WEEKDAYS.map(day => (
                <span key={day} className={styles.weekday}>
                  {day}
                </span>
              ))}
            </div>

            <div className={styles.grid}>
              {days.map((date, index) => {
                if (date === null) {
                  // eslint-disable-next-line react/no-array-index-key
                  return <span key={`blank-${index}`} className={styles.blank} />
                }

                const dayCycles = byDate.get(date) ?? []
                const isPast = today !== undefined && date < today
                const isToday = date === today

                return (
                  <button
                    key={date}
                    type="button"
                    className={clsx(
                      styles.day,
                      isPast && styles.dayPast,
                      isToday && styles.dayToday,
                      selectedDate === date && styles.daySelected
                    )}
                    aria-pressed={selectedDate === date}
                    onClick={() => {
                      selectDay(date)
                    }}
                  >
                    <span className={clsx(styles.dayNumber, isPast && styles.dayNumberPast)}>
                      {Number(date.slice(-2))}
                    </span>

                    {dayCycles.length > 0 && (
                      <>
                        {/*
                          Обе видимые метки скрыты от скринридера, а время ему
                          отдаётся отдельной подписью: иначе на широком экране
                          он читал бы «20:00» без слова «дедлайн», а на узком —
                          вообще ничего, кроме числа.
                        */}
                        <span className={styles.dayDots} aria-hidden={true}>
                          {dayCycles.map(cycle => (
                            <span
                              key={cycle.id}
                              className={clsx(
                                styles.dot,
                                cycle.id === activeCycleId && styles.dotActive
                              )}
                            />
                          ))}
                        </span>

                        <span className={styles.dayTimes} aria-hidden={true}>
                          {dayCycles.map(cycle => (
                            <span key={cycle.id} className={styles.dayCycle}>
                              <Badge
                                tone={cycle.id === activeCycleId ? 'brand' : 'neutral'}
                                withDot={cycle.id === activeCycleId}
                              >
                                {toStoreParts(cycle.deadlineAt)?.time ?? ''}
                              </Badge>
                            </span>
                          ))}
                        </span>

                        <span className={styles.dayLabel}>
                          {dayCycles
                            .map(cycle => `дедлайн ${toStoreParts(cycle.deadlineAt)?.time ?? ''}`)
                            .join(', ')}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className={styles.editor}>
        {selectedDate === null ? (
          <Text tone="secondary" size="sm">
            Выберите день в календаре, чтобы назначить дедлайн сбора или изменить назначенный.
          </Text>
        ) : (
          <>
            <Heading level={2} size="sm">
              {formatDate(`${selectedDate}T12:00:00Z`)}
            </Heading>

            {selectedCycle !== null && (
              <div className={styles.statusRow}>
                <Badge tone={selectedCycle.id === activeCycleId ? 'brand' : 'neutral'}>
                  {STATUS_LABELS[selectedCycle.status]}
                </Badge>
                {selectedCycle.id === activeCycleId && (
                  <Text tone="secondary" size="sm">
                    Именно этот сбор сейчас открыт для покупателей.
                  </Text>
                )}
              </div>
            )}

            <Input
              label="Время закрытия"
              type="time"
              value={draft.time}
              hint={`Время по магазину, UTC${storeOffsetLabel()}.`}
              onChange={next => {
                setDraft(current => ({ ...current, time: next }))
              }}
            />

            <Input
              label="Подпись"
              value={draft.label}
              maxLength={255}
              hint="Например: «Сбор на август». Видна в уведомлениях."
              onChange={next => {
                setDraft(current => ({ ...current, label: next }))
              }}
            />

            <div className={styles.editorActions}>
              <Button
                isLoading={isBusy}
                disabled={draft.time === ''}
                /*
                  Второй открытый сбор бэкенд не заведёт (`active_cycle_exists`), и
                  кнопка говорит об этом до нажатия. `unavailableReason`, а не
                  `disabled`: причина должна доставаться и с клавиатуры.
                */
                unavailableReason={
                  isPastDay ? PAST_DAY_REASON : isSecondCycle ? SECOND_CYCLE_REASON : null
                }
                onClick={() => {
                  if (selectedCycle === null) {
                    onCreate(draft)
                  } else {
                    onUpdate(selectedCycle, draft)
                  }
                }}
              >
                {selectedCycle === null ? 'Назначить сбор' : 'Сохранить'}
              </Button>

              {/*
                Закрыть можно только тот сбор, который сейчас идёт: закрытие — это
                конец приёма заявок, а у запланированного и у прошедшего его нет.
              */}
              {isActive && onClose !== undefined && (
                <Button
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => {
                    onClose(selectedCycle)
                  }}
                >
                  Закрыть сейчас
                </Button>
              )}

              {selectedCycle !== null && (
                <Button
                  variant="danger"
                  disabled={isBusy}
                  onClick={() => {
                    onDelete(selectedCycle)
                  }}
                >
                  Удалить
                </Button>
              )}
            </div>

            {/* Тот же порядок, что и у `unavailableReason`: прошедший день важнее. */}
            {(isPastDay || isSecondCycle) && (
              <Text tone="secondary" size="sm">
                {isPastDay ? PAST_DAY_REASON : SECOND_CYCLE_REASON}
              </Text>
            )}

            {isActive && onClose !== undefined && (
              <Text tone="muted" size="xs">
                «Закрыть сейчас» делает то же, что дедлайн: заявки больше не принимаются,
                неоформленные корзины переезжают в избранное, вам придёт итог сбора.
              </Text>
            )}

            {selectedCycle !== null && (
              <Text tone="muted" size="xs">
                Сбор с оформленными заявками удалить нельзя — бэкенд ответит отказом.
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  )
}
