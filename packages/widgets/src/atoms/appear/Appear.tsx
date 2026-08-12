import clsx from 'clsx'
import { type FC } from 'react'
import type { IAppearProps, IBasicStyling } from '../../types'
import * as styles from './Appear.css'

/**
 * Проявление блока, вставшего на место скелетона.
 *
 * Зачем вообще: подмена скелетона данными — это мгновенная перерисовка всего
 * прямоугольника, и глаз читает её как скачок. Короткое проявление превращает
 * скачок в смену состояния.
 *
 * Анимация живёт в CSS (см. `Appear.css.ts`): она должна начинаться с первой
 * отрисовки, а не после гидратации, иначе статические страницы приезжают с
 * невидимым содержимым. При `prefers-reduced-motion` остаётся одна
 * прозрачность — это тоже решает медиа-запрос, без JS.
 *
 * `appearKey` нужен там, где содержимое подменяется без размонтирования: смена
 * ключа пересоздаёт узел, и анимация играет заново. Списку, который просто
 * меняет состав (страница каталога, фильтр), ключ не нужен — повтор
 * проявления на каждое переключение как раз и читается как мигание.
 */
export const Appear: FC<IAppearProps & IBasicStyling> = ({
  children,
  appearKey,
  delay = 0,
  className,
}) => (
  <div
    key={appearKey}
    className={clsx(styles.container, className)}
    style={delay === 0 ? undefined : { animationDelay: `${delay}s` }}
  >
    {children}
  </div>
)
