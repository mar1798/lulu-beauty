import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPromotionPeriodFieldsProps } from '../../types'
import { Input } from '../../atoms/input'
import { Switch } from '../../atoms/switch'
import * as styles from './PromotionPeriodFields.css'

/**
 * Окно действия акции или промокода: начало (дата и время), переключатель
 * «Бессрочная» и конец. Поля управляемые: числа и текст ошибок держит форма, а
 * перевод в ISO и проверку «конец позже начала» она делает сама (`storeIso`) -
 * у каждой формы свой текст ошибки.
 *
 * Время - по магазину (Asia/Bishkek). Конец не включительно, поэтому в подсказке
 * назван момент, а не «день». «Бессрочная» прячет конец и уводит `endsAt: null`:
 * забытая дата не должна молча делать предложение вечным, поэтому это явный
 * выбор, а не пустое поле.
 *
 * `hideStart` прячет начало: у новости оно необязательно («показывать сразу»),
 * и форма сама решает, когда поля начала нужны.
 */

const DEFAULT_OPEN_ENDED_LABEL = 'Бессрочная - без даты окончания'
const DEFAULT_END_HINT = 'Время по Бишкеку. Акция действует до этого момента, не включая его.'

export const PromotionPeriodFields: FC<IPromotionPeriodFieldsProps & IBasicStyling> = ({
  startDate,
  startTime,
  endDate,
  endTime,
  isOpenEnded,
  errors,
  onChange,
  onOpenEndedChange,
  openEndedLabel = DEFAULT_OPEN_ENDED_LABEL,
  endHint = DEFAULT_END_HINT,
  hideStart = false,
  className,
}) => (
  <div className={clsx(styles.container, className)}>
    {!hideStart && (
      <div className={styles.pair}>
        <Input
          label="Начало, дата"
          type="date"
          value={startDate}
          required={true}
          error={errors.start}
          onChange={next => {
            onChange({ startDate: next })
          }}
        />
        <Input
          label="Начало, время"
          type="time"
          value={startTime}
          required={true}
          onChange={next => {
            onChange({ startTime: next })
          }}
        />
      </div>
    )}

    <Switch label={openEndedLabel} checked={isOpenEnded} onChange={onOpenEndedChange} />

    {!isOpenEnded && (
      <div className={styles.pair}>
        <Input
          label="Конец, дата"
          type="date"
          value={endDate}
          required={true}
          error={errors.end}
          onChange={next => {
            onChange({ endDate: next })
          }}
        />
        <Input
          label="Конец, время"
          type="time"
          value={endTime}
          hint={endHint}
          required={true}
          onChange={next => {
            onChange({ endTime: next })
          }}
        />
      </div>
    )}
  </div>
)
