import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IHomeHeroProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './HomeHero.css'

/**
 * Первый экран главной: чем занимается магазин и что происходит прямо сейчас.
 *
 * Сбор приходит слотом `aside` — таймер, «сбор закрыт» или скелетон выбирает
 * страница: активный цикл она берёт из API, а виджету про запросы знать
 * не положено.
 */
export const HomeHero: FC<IHomeHeroProps & IBasicStyling> = ({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}) => (
  <section className={clsx(styles.container, className)}>
    <div className={styles.body}>
      {eyebrow !== undefined && <span className={styles.eyebrow}>{eyebrow}</span>}

      {/* h1 страницы: другого смыслового заголовка верхнего уровня на главной нет. */}
      <Heading level={1}>{title}</Heading>

      {description !== undefined && <Text tone="secondary">{description}</Text>}

      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>

    {aside !== undefined && <div className={styles.aside}>{aside}</div>}
  </section>
)
