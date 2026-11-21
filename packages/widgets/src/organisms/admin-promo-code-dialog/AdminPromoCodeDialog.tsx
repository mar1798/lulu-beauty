import clsx from 'clsx'
import { type FC, useEffect, useState } from 'react'
import type {
  IAdminPromoCodeDialogProps,
  IBasicStyling,
  IPromoCodeDraft,
  IPromotionRowErrors,
  ISelectOption,
} from '../../types'
import { Alert } from '../../atoms/alert'
import { Button } from '../../atoms/button'
import { Input } from '../../atoms/input'
import { Select } from '../../atoms/select'
import { Text } from '../../atoms/text'
import {
  buildPromoCode,
  isNewPastCodeWindow,
  MAX_PROMO_CODE_VALID_DAYS,
} from '../../utils/promotion'
import { Modal } from '../modal'
import { PromotionConditionBuilder } from '../promotion-condition-builder'
import { PromotionRewardBuilder } from '../promotion-reward-builder'
import * as styles from './AdminPromoCodeDialog.css'

/**
 * Окно настроек промокода — награды акции `PROMO_CODE`.
 *
 * Код персональный и одноразовый, выдаётся после оплаты заявки. Окно собирает
 * три вещи: срок (в днях с выдачи или между двумя датами), условия, при которых
 * код сработает, и то, что он даёт (скидка или подарок; промокод в промокоде
 * невозможен — цепочка не кончалась бы). Условия и награды строятся теми же
 * конструкторами, что и у самой акции.
 *
 * Правки живут в черновике окна и применяются только по «Сохранить»; закрытие
 * без него их отбрасывает. Клик мимо окна не закрывает (`isDismissable={false}`):
 * за ним набранное. Отказ проверки — у поля или над кнопками, до отправки формы
 * акции.
 */

const VALIDITY_OPTIONS: ISelectOption[] = [
  { value: 'DAYS', label: 'Столько-то дней с выдачи' },
  { value: 'DATES', label: 'Между двумя датами' },
]

const DAYS_MAX_LENGTH = String(MAX_PROMO_CODE_VALID_DAYS).length

export const AdminPromoCodeDialog: FC<IAdminPromoCodeDialogProps & IBasicStyling> = ({
  isOpen,
  onClose,
  value,
  onSave,
  catalog,
  className,
}) => {
  const [draft, setDraft] = useState<IPromoCodeDraft>(value)
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<IPromotionRowErrors>({})

  // Окно открывается заново с тем, что сейчас стоит в акции, — а не с прошлыми недосохранёнными правками.
  useEffect(() => {
    if (isOpen) {
      setDraft(value)
      setError(null)
      setRowErrors({})
    }
    // Только открытие: правка `value` снаружи при открытом окне не должна затирать набранное.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const save = (): void => {
    const built = buildPromoCode(draft)

    setRowErrors(built.errors)

    if (built.value === null) {
      setError(built.error ?? 'Исправьте отмеченные поля: у некоторых строк есть ошибки')

      return
    }

    if (isNewPastCodeWindow(draft, value)) {
      setError('Срок действия промокода уже закончился - укажите дату в будущем')

      return
    }

    setError(null)
    onSave(draft)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Настройки промокода"
      size="lg"
      isDismissable={false}
      className={clsx(styles.container, className)}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" isFullWidth="mobile" onClick={onClose}>
            Отмена
          </Button>
          <Button isFullWidth="mobile" onClick={save}>
            Сохранить
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <Text size="sm" tone="secondary">
          Промокод получает покупатель после оплаты заявки, участвовавшей в акции. Он личный и
          одноразовый.
        </Text>

        <section className={styles.section} aria-labelledby="promo-code-validity">
          <h3 className={styles.sectionTitle} id="promo-code-validity">
            Срок действия
          </h3>

          <Select
            label="Как считается срок"
            value={draft.validity}
            options={VALIDITY_OPTIONS}
            onChange={next => {
              setDraft({ ...draft, validity: next === 'DATES' ? 'DATES' : 'DAYS' })
            }}
          />

          {draft.validity === 'DAYS' ? (
            <Input
              label="Дней с момента выдачи"
              value={draft.validDays}
              inputMode="numeric"
              maxLength={DAYS_MAX_LENGTH}
              hint={`От 1 до ${MAX_PROMO_CODE_VALID_DAYS}`}
              required={true}
              onChange={next => {
                setDraft({ ...draft, validDays: next.replace(/\D/g, '') })
              }}
            />
          ) : (
            <div className={styles.dates}>
              <Input
                label="Действует с"
                type="date"
                value={draft.validFromDate}
                required={true}
                onChange={next => {
                  setDraft({ ...draft, validFromDate: next })
                }}
              />
              <Input
                label="Действует по"
                type="date"
                value={draft.validUntilDate}
                hint="Включительно, до конца дня"
                required={true}
                onChange={next => {
                  setDraft({ ...draft, validUntilDate: next })
                }}
              />
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="promo-code-conditions">
          <h3 className={styles.sectionTitle} id="promo-code-conditions">
            Условия
          </h3>
          <Text size="sm" tone="muted">
            Когда код сработает. Все условия должны выполняться сразу.
          </Text>
          <PromotionConditionBuilder
            value={draft.conditions}
            catalog={catalog}
            errors={rowErrors}
            onChange={conditions => {
              setDraft({ ...draft, conditions })
            }}
          />
        </section>

        <section className={styles.section} aria-labelledby="promo-code-rewards">
          <h3 className={styles.sectionTitle} id="promo-code-rewards">
            Что даёт код
          </h3>
          <PromotionRewardBuilder
            value={draft.rewards}
            catalog={catalog}
            errors={rowErrors}
            allowPromoCode={false}
            onChange={rewards => {
              setDraft({ ...draft, rewards })
            }}
          />
        </section>

        {error !== null && (
          <Alert tone="danger" title="Промокод не сохранён">
            {error}
          </Alert>
        )}
      </div>
    </Modal>
  )
}
