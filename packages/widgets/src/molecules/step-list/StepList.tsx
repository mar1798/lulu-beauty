import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStepListProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Text } from '../../atoms/text'
import * as styles from './StepList.css'

/**
 * Пронумерованные шаги: «как работает заявка».
 *
 * Разметка — настоящий `<ol>`: порядок здесь несёт смысл, и скринридер
 * должен объявить «список из трёх пунктов, пункт 1». Номер в кружке нарисован
 * отдельно и скрыт от него — иначе номер прозвучал бы дважды. Маркеры
 * возвращать не нужно: `preflight` их гасит, а мы рисуем свои.
 */
export const StepList: FC<IStepListProps & IBasicStyling> = ({ steps, className }) => (
  <ol className={clsx(styles.container, className)}>
    {steps.map((step, index) => (
      <li key={step.title} className={styles.item}>
        <span className={styles.number} aria-hidden={true}>
          {index + 1}
        </span>

        <div className={styles.body}>
          <Heading level={3} size="sm">
            {step.title}
          </Heading>

          <Text size="sm" tone="secondary">
            {step.description}
          </Text>
        </div>
      </li>
    ))}
  </ol>
)
