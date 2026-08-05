import type { FC } from 'react'
import type { IBasicStyling } from '../types'

/**
 * Набор иконок интерфейса. Рисуются инлайном, а не через `.svg` + svgr:
 * иконок мало, все однотипные (штрих `currentColor`, размер `1em`),
 * и так они не тянут за собой настройку загрузчика в каждом потребителе.
 *
 * Размер задаётся `font-size` родителя, цвет — `color`.
 */

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const

export const IconEye: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </svg>
)

export const IconEyeOff: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a18.4 18.4 0 0 1-3.2 3.9M6.5 7.6A18.3 18.3 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 3.7-.7" />
    <path d="m9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </svg>
)

export const IconChevronDown: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const IconCheck: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className} strokeWidth={2.5}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const IconClose: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M6 6 18 18M18 6 6 18" />
  </svg>
)

export const IconCart: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20 7.5H6" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
)

export const IconMenu: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const IconUpload: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </svg>
)

export const IconSearch: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
)

export const IconChevronLeft: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)

export const IconChevronRight: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconBox: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12 3 20.5 7.5v9L12 21l-8.5-4.5v-9L12 3Z" />
    <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" />
  </svg>
)

export const IconUser: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
)

export const IconPlus: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconTrash: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 4h4M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </svg>
)

export const IconPencil: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
  </svg>
)

/** Восстановление мягко удалённого товара. */
export const IconRestore: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </svg>
)

export const IconDownload: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 20h16" />
  </svg>
)

export const IconCalendar: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
)

export const IconStar: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />
  </svg>
)

export const IconTags: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3.5 11V4.5H10L20 14.5 13.5 21 3.5 11Z" />
    <circle cx="7.25" cy="8.25" r="1.25" />
  </svg>
)

export const IconChart: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)
