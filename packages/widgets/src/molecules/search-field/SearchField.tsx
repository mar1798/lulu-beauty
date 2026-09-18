import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ISearchFieldProps } from '../../types'
import { IconClose, IconSearch } from '../../svg/icons'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
import { Spinner } from '../../atoms/spinner'
import * as styles from './SearchField.css'

/**
 * Поиск по каталогу. Управляемый и без собственной задержки: дебаунс — забота
 * страницы (`useDebouncedValue`), потому что решать, когда бить в API, должен
 * тот, кто этот запрос делает.
 *
 * Ищет бэкенд (`GET /products?q=`), а не фронт по загруженной странице.
 *
 * Подпись необязательна: placeholder у поля говорящий, и над ним подпись
 * обычно оказывается его же дословным повтором. Без неё поле не остаётся
 * безымянным — тем же текстом подставляется `aria-label`, потому что
 * placeholder именем для скринридера не считается.
 *
 * `isBusy` показывает занятость в самом поле: в каталоге прошлые товары
 * остаются на экране до ответа, и без спиннера полсекунды между последней
 * буквой и новой выдачей выглядят так, будто поиск не работает. Там, где
 * выдачу подменяет скелетон (подборщик), спиннер встаёт раньше него — пока
 * человек ещё смотрит в поле.
 */
export const SearchField: FC<ISearchFieldProps & IBasicStyling> = ({
  value,
  onChange,
  label,
  placeholder = 'Поиск по названию',
  isBusy = false,
  className,
}) => (
  <Input
    className={clsx(styles.container, className)}
    type="search"
    value={value}
    onChange={onChange}
    label={label}
    ariaLabel={placeholder}
    placeholder={placeholder}
    prefix={
      isBusy ? (
        <span className={styles.spinner}>
          {/* «Загрузку» объявляет контейнер выдачи (`aria-busy`) — здесь молча. */}
          <Spinner size="sm" label={null} />
        </span>
      ) : (
        <IconSearch className={styles.icon} />
      )
    }
    suffix={
      value === '' ? undefined : (
        <IconButton
          className={styles.clear}
          size="sm"
          variant="ghost"
          icon={<IconClose />}
          label="Очистить поиск"
          onClick={() => onChange('')}
        />
      )
    }
  />
)
