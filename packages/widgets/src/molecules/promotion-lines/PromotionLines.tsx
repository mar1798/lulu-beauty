import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPromotionLinesProps } from '../../types'
import { IconPercent } from '../../svg/icons'
import { AppLink } from '../../atoms/app-link'
import { formatPrice } from '../../atoms/price'
import { Text } from '../../atoms/text'
import * as styles from './PromotionLines.css'

/**
 * Акции корзины двумя кусками из одного ответа сервера.
 *
 * `discounts` - строки итогов: «Акция «…» - 500 сом». Акция, которая дала только
 * подарок, строки не получает: снимать с суммы нечего, подарок рисуется своей
 * строкой (`GiftLine`). `hints` - «Ещё 300 сом до акции «…»»: корзине не хватает
 * одной суммы, и это единственное, что человеку здесь нужно знать.
 *
 * Суммы приходят готовыми - ничего не считается и не округляется на клиенте.
 */
export const PromotionLines: FC<IPromotionLinesProps & IBasicStyling> = ({
  promotions,
  kind,
  buildPromotionHref,
  code = null,
  className,
}) => {
  if (kind === 'hints') {
    if (promotions.hints.length === 0) {
      return null
    }

    return (
      <ul className={clsx(styles.hints, className)}>
        {promotions.hints.map(hint => (
          <li key={hint.promotionId} className={styles.hint}>
            <span className={styles.hintIcon}>
              <IconPercent />
            </span>

            <Text size="sm" as="span">
              {`Ещё ${formatPrice(hint.missingCents)} до акции `}
              {buildPromotionHref === undefined ? (
                `«${hint.title}»`
              ) : (
                <AppLink href={buildPromotionHref(hint.slug)} className={styles.link}>
                  {`«${hint.title}»`}
                </AppLink>
              )}
            </Text>
          </li>
        ))}
      </ul>
    )
  }

  const discounted = promotions.applied.filter(entry => entry.discountCents > 0)
  const hasCode = code !== null && code.discountCents > 0

  if (discounted.length === 0 && !hasCode) {
    return null
  }

  return (
    <ul className={clsx(styles.discounts, className)}>
      {discounted.map(entry => (
        <li key={entry.promotionId} className={styles.row}>
          <Text size="sm" tone="secondary" as="span" clamp={2}>
            {`Акция «${entry.title}»`}
          </Text>

          <Text size="sm" weight="medium" tone="success" as="span" className={styles.amount}>
            {`-${formatPrice(entry.discountCents)}`}
          </Text>
        </li>
      ))}

      {hasCode && (
        <li className={styles.row}>
          <Text size="sm" tone="secondary" as="span">
            {`Промокод ${code.code}`}
          </Text>

          <Text size="sm" weight="medium" tone="success" as="span" className={styles.amount}>
            {`-${formatPrice(code.discountCents)}`}
          </Text>
        </li>
      )}
    </ul>
  )
}
