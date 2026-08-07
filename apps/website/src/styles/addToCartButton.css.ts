import { style } from '@vanilla-extract/css'
import { media } from 'widgets/styling/lib'

/**
 * На мобильном карточка товара слишком узкая для кнопки с текстом — вместо
 * неё показывается иконка-плюс, а от `sm` возвращается обычная кнопка.
 * Оба варианта рендерятся всегда, переключает их только медиа-запрос —
 * так гидратация не зависит от ширины экрана на сервере.
 */
export const mobileOnly = style({
  display: 'inline-flex',
  ...media({ sm: { display: 'none' } }),
})

export const desktopOnly = style({
  display: 'none',
  ...media({ sm: { display: 'inline-flex' } }),
})
