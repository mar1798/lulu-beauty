import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPromoCodeCardProps, PromoCodeView } from '../../types'
import { IconCopy } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { Badge } from '../../atoms/badge'
import { Button } from '../../atoms/button'
import { IconButton } from '../../atoms/icon-button'
import { Text } from '../../atoms/text'
import { formatShortDate } from '../../utils/datetime'
import {
  PROMO_CODE_STATUS_LABELS,
  describePromoCodeConditions,
  describePromoCodeRewards,
} from '../../utils/promotion'
import * as styles from './PromoCodeCard.css'

/**
 * Карточка промокода на странице «Промокоды»: сам код с копированием, что он
 * даёт, при каких условиях работает, срок и статус.
 *
 * Статус приходит с сервера (`EXPIRED` он вычисляет по сроку на момент ответа),
 * здесь только подпись и тон. Недействующий код - использованный, истёкший,
 * отозванный - остаётся на странице приглушённым: по нему видно, почему код не
 * подошёл, а копировать его уже незачем, поэтому кнопка копирования у него
 * пропадает.
 */

const TONES: Record<PromoCodeView, 'success' | 'info' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  RESERVED: 'info',
  USED: 'neutral',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
}

export const PromoCodeCard: FC<IPromoCodeCardProps & IBasicStyling> = ({
  code,
  useHref,
  onCopy,
  buildOrderHref,
  className,
}) => {
  const isActive = code.status === 'ACTIVE'
  const conditions = describePromoCodeConditions(code)
  const orderId = code.usedOrderId

  return (
    <article className={clsx(styles.container, !isActive && styles.inactive, className)}>
      <div className={styles.head}>
        <Badge tone={TONES[code.status]} withDot={true}>
          {PROMO_CODE_STATUS_LABELS[code.status]}
        </Badge>

        {code.promotionTitle !== null && (
          <Text size="sm" tone="muted" as="span" clamp={1}>
            {`Акция «${code.promotionTitle}»`}
          </Text>
        )}
      </div>

      <div className={styles.codeRow}>
        <span className={styles.code}>{code.code}</span>

        {onCopy !== undefined && isActive && (
          <IconButton
            icon={<IconCopy />}
            label={`Скопировать код ${code.code}`}
            size="lg"
            onClick={() => {
              onCopy(code.code)
            }}
          />
        )}
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.term}>Что даёт</dt>
          <dd className={styles.value}>{describePromoCodeRewards(code)}</dd>
        </div>

        {conditions !== '' && (
          <div className={styles.fact}>
            <dt className={styles.term}>Условия</dt>
            <dd className={styles.value}>{conditions}</dd>
          </div>
        )}

        <div className={styles.fact}>
          <dt className={styles.term}>Срок</dt>
          <dd className={styles.value}>
            {`${formatShortDate(code.validFrom)} - ${formatShortDate(code.expiresAt)}`}
          </dd>
        </div>
      </dl>

      {orderId !== null && buildOrderHref !== undefined && (
        <AppLink href={buildOrderHref(orderId)} className={styles.orderLink}>
          {code.status === 'USED' ? 'Использован в заявке' : 'Лежит в заявке'}
        </AppLink>
      )}

      {isActive && useHref !== undefined && (
        <Button variant="secondary" link={{ href: useHref }} isFullWidth="mobile">
          Использовать
        </Button>
      )}
    </article>
  )
}
