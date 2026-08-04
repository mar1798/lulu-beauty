import { type FC, useState } from 'react'
import type { IBasicStyling, IPasswordInputProps } from '../../types'
import { IconEye, IconEyeOff } from '../../svg/icons'
import { IconButton } from '../icon-button'
import { Input } from '../input'
import * as styles from './PasswordInput.css'

/**
 * Пароль с переключателем видимости. Отдельный атом, а не проп `Input`,
 * потому что переключатель — это состояние, а `Input` намеренно оставлен
 * управляемым и без собственного состояния.
 */
export const PasswordInput: FC<IPasswordInputProps & IBasicStyling> = props => {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <Input
      {...props}
      type={isVisible ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      suffix={
        <IconButton
          className={styles.toggle}
          size="sm"
          variant="ghost"
          icon={isVisible ? <IconEyeOff /> : <IconEye />}
          label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
          onClick={() => setIsVisible(current => !current)}
        />
      }
    />
  )
}
