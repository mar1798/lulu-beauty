import clsx from 'clsx'
import { type FC } from 'react'
import type { IBasicStyling, ISearchFieldProps } from '../../types'
import { IconClose, IconSearch } from '../../svg/icons'
import { IconButton } from '../../atoms/icon-button'
import { Input } from '../../atoms/input'
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
 */
export const SearchField: FC<ISearchFieldProps & IBasicStyling> = ({
  value,
  onChange,
  label,
  placeholder = 'Поиск по названию',
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
    prefix={<IconSearch className={styles.icon} />}
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
