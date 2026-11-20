import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IPromotionDetailsProps } from '../../types'
import { breakpoints } from '../../breakpoints'
import { Button } from '../../atoms/button'
import { Heading } from '../../atoms/heading'
import { RichText } from '../../atoms/rich-text'
import { Text } from '../../atoms/text'
import { GiftLine } from '../../molecules/gift-line'
import { formatDate } from '../../utils/datetime'
import { BANNER_SPECS, describeCondition, describeReward } from '../../utils/promotion'
import * as styles from './PromotionDetails.css'

/**
 * Страница акции: баннер, срок, описание владельца, условия и что получает покупатель.
 *
 * Баннер держит те же пропорции, что и в карусели (мобильный 3:2, с `md` - 3:1), и
 * кадрируется `cover`: акция без десктопного баннера на широком экране показывает
 * мобильный, не растягивая страницу вниз. Баннера может не быть вовсе - тогда
 * страница начинается с заголовка.
 *
 * Условия и награды называются теми же словами, что и в админке
 * (`describeCondition` / `describeReward`): владелец видит ровно то, что прочтёт
 * покупатель. Подарок рисуется строкой с картинкой, остальное - списком. Что
 * скидки и подарки применяются сами, при оформлении, сказано под списком: кнопки
 * «получить» у акции нет, участие не требует действий.
 */
export const PromotionDetails: FC<IPromotionDetailsProps & IBasicStyling> = ({
  promotion,
  catalogHref,
  className,
}) => {
  const { conditions, rewards } = promotion
  const gifts = rewards.flatMap(reward => (reward.type === 'GIFT' ? [reward] : []))
  const others = rewards.filter(reward => reward.type !== 'GIFT')
  const hasCodeReward = rewards.some(reward => reward.type === 'PROMO_CODE')

  return (
    <article className={clsx(styles.container, className)}>
      {promotion.bannerMobileUrl !== null && (
        <div className={styles.banner}>
          <picture>
            {promotion.bannerDesktopUrl !== null && (
              <source
                media={`(min-width: ${breakpoints.md}px)`}
                srcSet={promotion.bannerDesktopUrl}
              />
            )}

            <img
              className={styles.image}
              src={promotion.bannerMobileUrl}
              alt={promotion.title}
              width={BANNER_SPECS.mobile.width}
              height={BANNER_SPECS.mobile.height}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
      )}

      <header className={styles.head}>
        <Heading level={1}>{promotion.title}</Heading>

        <Text tone="secondary">
          {promotion.endsAt === null
            ? `Действует с ${formatDate(promotion.startsAt)}, бессрочно`
            : `Действует с ${formatDate(promotion.startsAt)} по ${formatDate(promotion.endsAt)}`}
        </Text>
      </header>

      {promotion.descriptionHtml !== null && promotion.descriptionHtml !== '' && (
        <RichText html={promotion.descriptionHtml} />
      )}

      <section className={styles.section} aria-labelledby="promotion-conditions">
        <Heading level={2} size="md" id="promotion-conditions">
          Условия
        </Heading>

        {conditions.length === 0 ? (
          <Text>Особых условий нет: акция действует на любую заявку.</Text>
        ) : (
          <ul className={styles.list}>
            {conditions.map((condition, index) => (
              // Условия не переставляются и не имеют id: порядок в ответе и есть ключ.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>{describeCondition(condition)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="promotion-rewards">
        <Heading level={2} size="md" id="promotion-rewards">
          Что вы получите
        </Heading>

        {others.length > 0 && (
          <ul className={styles.list}>
            {others.map((reward, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>{describeReward(reward)}</li>
            ))}
          </ul>
        )}

        {gifts.length > 0 && (
          <div>
            {gifts.map((gift, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <GiftLine key={index} gift={gift} />
            ))}
          </div>
        )}

        <Text size="sm" tone="muted">
          {hasCodeReward
            ? 'Скидки и подарки применяются сами при оформлении заявки. Промокод приходит после оплаты заявки - он появится в разделе «Промокоды».'
            : 'Скидки и подарки применяются сами при оформлении заявки - ничего вводить не нужно.'}
        </Text>
      </section>

      <div className={styles.actions}>
        <Button link={{ href: catalogHref }} isFullWidth="mobile">
          Перейти в каталог
        </Button>
      </div>
    </article>
  )
}
