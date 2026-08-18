import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, IStepListProps } from '../../types'
import { Heading } from '../../atoms/heading'
import { Parallax } from '../../atoms/parallax'
import { Reveal } from '../../atoms/reveal'
import { Text } from '../../atoms/text'
import { StepScene } from '../step-scene'
import { staggerDelay } from '../../utils/motion'
import * as styles from './StepList.css'

/**
 * Пронумерованные шаги: «как работает заявка».
 *
 * Разметка — настоящий `<ol>`: порядок здесь несёт смысл, и скринридер
 * должен объявить «список из четырёх пунктов, пункт 1». Номер в кружке
 * нарисован отдельно и скрыт от него — иначе номер прозвучал бы дважды.
 * Маркеры возвращать не нужно: `preflight` их гасит, а мы рисуем свои.
 *
 * Над текстом шага — мини-сцена (`StepScene`), если страница задала
 * `visual`: блок, объясняющий устройство всего продукта, не должен быть
 * набран самым обычным текстом. Номер живёт в строке заголовка: с высокой
 * сценой сверху отдельная левая колонка оставляла бы пустой угол.
 * Соединительной линии между номерами больше нет — её роль забрали сцены.
 *
 * Шаги входят в вьюпорт лесенкой; внутри шага той же лесенкой идут части
 * сцены (`variants` наследуются от `Reveal`). Сцена едет лёгким параллаксом
 * относительно своего текста — текст не двигается: параллакс на строках
 * мешает читать.
 */

/**
 * Амплитуда параллакса сцены, px. Меньше умолчания `Parallax`: сцена лежит
 * внутри читаемой карточки, и заметный ход отрывал бы её от текста.
 */
const SCENE_PARALLAX = 18

export const StepList: FC<IStepListProps & IBasicStyling> = ({ steps, className }) => (
  <ol className={clsx(styles.container, className)}>
    {steps.map((step, index) => (
      <Reveal key={step.title} as="li" delay={staggerDelay(index)} className={styles.item}>
        {step.visual !== undefined && (
          <Parallax strength={SCENE_PARALLAX}>
            <StepScene kind={step.visual} delay={staggerDelay(index)} />
          </Parallax>
        )}

        <div className={styles.heading}>
          <span className={styles.number} aria-hidden={true}>
            {index + 1}
          </span>

          <Heading level={3} size="sm">
            {step.title}
          </Heading>
        </div>

        <Text size="sm" tone="secondary">
          {step.description}
        </Text>
      </Reveal>
    ))}
  </ol>
)
