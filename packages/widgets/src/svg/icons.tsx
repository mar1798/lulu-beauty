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

/**
 * Сердце — «в избранное». Две формы одного контура: пустая (не сохранено) и
 * залитая (сохранено). Состояние читается заливкой, а не только цветом —
 * на приглушённой карточке разница в оттенке видна не всем.
 */
const HEART_PATH =
  'M12 20.3s-7.5-4.4-7.5-9.4a4.3 4.3 0 0 1 7.5-2.8 4.3 4.3 0 0 1 7.5 2.8c0 5-7.5 9.4-7.5 9.4Z'

export const IconHeart: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d={HEART_PATH} />
  </svg>
)

export const IconHeartFilled: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className} fill="currentColor">
    <path d={HEART_PATH} />
  </svg>
)

/**
 * Логотип Telegram — единственная иконка набора, нарисованная заливкой и в
 * своей системе координат: это бренд-знак, а не элемент интерфейса, и
 * перерисовывать его штрихом под остальные значило бы рисовать уже не его.
 *
 * Путь взят из самой кнопки Login Widget, которую Telegram рисует у себя в
 * iframe на `/login`. Соседство тут и есть причина: знак в чужом iframe нам
 * не подчиняется, а похожий-но-свой самолётик рядом с настоящим читается как
 * две разные службы. Совпадать они могут только одним способом — если это
 * буквально один и тот же контур. Поэтому его не надо «подгонять под сетку»:
 * любая правка расхождение и вернёт.
 *
 * `fillRule` здесь значащий — им вырезан сгиб крыла.
 *
 * Размер и цвет ведут себя как у всех прочих: `1em` от родителя и
 * `currentColor`, поэтому в кнопке входа знак сам принимает её цвет.
 */
export const IconTelegram: FC<IBasicStyling> = ({ className }) => (
  <svg
    {...base}
    className={className}
    viewBox="0 0 20 20"
    fill="currentColor"
    fillRule="evenodd"
    stroke="none"
  >
    <path d="m1.77404283 9.58769086c4.67714245-1.99564845 7.79596997-3.31130205 9.35648257-3.9469608 4.4555806-1.81493491 5.381412-2.13020854 5.984856-2.14061906.1327219-.0022897.4294781.02992311.6217044.18267827.162312.12898346.2069705.30322179.2283411.42551228.0213705.12229049.047982.40087134.0268279.61854631-.2414495 2.48450744-1.2861975 8.51375174-1.817706 11.29644264-.2249011 1.1774608-.6709749 1.4294697-1.0996928 1.4681058-.9317032.0839651-1.6359598-.4602232-2.5383599-1.0395344-1.412078-.9065075-1.9311138-1.1506648-3.30178003-2.0352487-1.58404193-1.0222898-.71982554-1.5573792.18291533-2.4756292.23625159-.2403103 4.3705401-3.98382431 4.4499945-4.31554914.0099371-.04148774-.12607-.45629906-.2198814-.53795815s-.2322689-.05373486-.3321837-.03152647c-.1416262.03147972-2.397439 1.49167812-6.76743852 4.38059516-.64030496.4305972-1.22027332.6403987-1.73990507.6294043-.5728523-.0121204-1.67479033-.3172064-2.49396798-.5779863-1.00475474-.3198572-1.37564449-.4704946-1.30610794-1.013711.03621894-.2829407.29151946-.57846124.76590154-.88656154z" />
  </svg>
)

/**
 * Знак Instagram. В отличие от Telegram он рисуется штрихом, как остальной
 * набор: сам фирменный знак — контурный, и подгонять его под `base` не
 * приходится.
 */
export const IconInstagram: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

/*
  Панель редактора описания. Рисунки — по мотивам Lucide (ISC), в той же
  системе, что остальной набор: штрих `currentColor`, сетка 24.
*/

export const IconBold: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className} strokeWidth={2.25}>
    <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
)

export const IconItalic: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M19 5h-9M14 19H5M15 5 9 19" />
  </svg>
)

export const IconHeading: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
  </svg>
)

export const IconListBullets: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.75} />
  </svg>
)

export const IconListNumbers: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
)

export const IconLink: FC<IBasicStyling> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
)
