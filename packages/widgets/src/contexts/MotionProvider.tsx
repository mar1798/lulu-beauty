import { LazyMotion } from 'motion/react'
import type { FC, ReactNode } from 'react'

/**
 * Подключение motion для всех `m.*` в библиотеке.
 *
 * Компоненты `widgets` рендерят облегчённые `m.div`/`m.span` вместо полного
 * `motion.*`: тот тащил весь движок анимаций в `_app` каждой страницы (~30 КБ
 * gzip), и первый тап на телефоне отзывался позже. Движок приезжает отдельным
 * чанком (`motion/features.ts`) уже после гидрации — до этого узлы просто стоят
 * в начальном состоянии.
 *
 * `strict` — полный `motion.*` внутри провайдера бросает ошибку: один такой
 * импорт незаметно вернул бы движок в общий бандл.
 *
 * Storybook и тесты берут движок сразу (`StoryWrapper`): там ждать чанка незачем.
 * Здесь `domMax` не импортируется даже ради такого режима — статический импорт
 * вернул бы его в бандл сайта.
 */
const loadFeatures = (): Promise<typeof import('../motion/features').default> =>
  import('../motion/features').then(module => module.default)

export const MotionProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <LazyMotion features={loadFeatures} strict={true}>
    {children}
  </LazyMotion>
)
