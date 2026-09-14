import clsx from 'clsx'
import { type FC } from 'react'
import type { IAlertProps, IBasicStyling } from '../../types'
import { IconClose } from '../../svg/icons'
import { IconButton } from '../icon-button'
import * as styles from './Alert.css'

/**
 * Сообщение об ошибке или результате действия.
 *
 * `role` зависит от тона: ошибка объявляется скринридером немедленно
 * (`alert`), нейтральное сообщение — деликатно, не перебивая пользователя
 * (`status`). Это разные `aria-live`, и путать их не стоит.
 *
 * Появление анимировано прямо здесь, а не обёрткой снаружи: сообщение
 * сдвигает форму под собой, и без проявления этот сдвиг читается как
 * подёргивание страницы. Обёртку `Appear` тут применить нельзя: она добавила
 * бы лишний блок между `alert` и его контейнером в тех местах, где алерт
 * стоит в сетке, — поэтому анимация живёт в `Alert.css.ts` на самом узле.
 *
 * Почему CSS, а не Motion: врезка появляется не только в ответ на действие —
 * «Приём заказов закрыт» приезжает уже в статической разметке каталога, а
 * начальный кадр Motion уехал бы в неё и держал бы её невидимой до гидратации
 * (замеры — в комментарии `Alert.css.ts`). `prefers-reduced-motion` там же
 * решается медиа-запросом, без JS.
 */
export const Alert: FC<IAlertProps & IBasicStyling> = ({
  children,
  title,
  tone = 'info',
  action,
  onClose,
  className,
}) => {
  return (
    <div
      className={clsx(styles.container, styles.tone[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <div className={styles.body}>
        {title !== undefined && <span className={styles.title}>{title}</span>}
        <span className={styles.message}>{children}</span>

        {action !== undefined && <div className={styles.action}>{action}</div>}
      </div>

      {onClose !== undefined && (
        <IconButton
          className={styles.close}
          size="sm"
          variant="ghost"
          icon={<IconClose />}
          label="Закрыть сообщение"
          onClick={onClose}
        />
      )}
    </div>
  )
}
