import clsx from 'clsx'
import React, { useId } from 'react'
import * as styles from './halloween.css'

/**
 * Летучая мышь с машущими крыльями — встроенный SVG, а не `<img>`.
 *
 * Картинка через `<img>` для браузера — неподвижный рисунок: Chrome не
 * проигрывает ни CSS-анимацию, ни SMIL внутри такого SVG, и мышь летала с
 * застывшими крыльями. В DOM крылья — обычные элементы, и машут классами из
 * `halloween.css.ts` (там же пауза для `prefers-reduced-motion`).
 *
 * Идентификаторы градиентов и фильтров — через `useId`: на странице бывает
 * две мыши сразу (сцена каталога и пролёт), а `url(#…)` ищет по всему
 * документу.
 */
export const BatFlap: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style,
}) => {
  const id = useId().replace(/:/g, '')
  const wing = `${id}w`
  const body = `${id}b`
  const shadow = `${id}s`
  const blur = `${id}r`

  return (
    <svg
      viewBox="0 0 400 230"
      width={400}
      height={230}
      className={clsx(styles.batSvg, className)}
      style={style}
      aria-hidden={true}
      focusable={false}
    >
      <defs>
        <radialGradient id={wing} cx=".5" cy=".2" r=".9">
          <stop offset="0" stopColor="#6A5872" />
          <stop offset=".6" stopColor="#3F3347" />
          <stop offset="1" stopColor="#2A2230" />
        </radialGradient>
        <radialGradient id={body} cx=".38" cy=".3" r=".8">
          <stop offset="0" stopColor="#6E5D78" />
          <stop offset=".55" stopColor="#3D3145" />
          <stop offset="1" stopColor="#231C29" />
        </radialGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#2A1E33" floodOpacity=".22" />
        </filter>
        <filter id={blur}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <g className={clsx(styles.wing, styles.wingLeft)}>
          <path
            d="M176 136 C150 96 98 70 34 84 C56 98 64 118 60 142 C80 132 100 138 108 158 C122 144 142 146 152 164 C160 154 168 152 178 158 Z"
            fill={`url(#${wing})`}
          />
          <path
            d="M174 132 L60 142 M174 132 L108 158 M174 134 L152 164 M174 130 C140 100 90 84 40 86"
            stroke="#7D6A88"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity=".45"
          />
        </g>
        <g className={clsx(styles.wing, styles.wingRight)}>
          <path
            d="M224 136 C250 96 302 70 366 84 C344 98 336 118 340 142 C320 132 300 138 292 158 C278 144 258 146 248 164 C240 154 232 152 222 158 Z"
            fill={`url(#${wing})`}
          />
          <path
            d="M226 132 L340 142 M226 132 L292 158 M226 134 L248 164 M226 130 C260 100 310 84 360 86"
            stroke="#7D6A88"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity=".45"
          />
        </g>
        <path d="M172 102 L164 58 Q166 52 172 56 L196 90 Z" fill={`url(#${body})`} />
        <path d="M228 102 L236 58 Q234 52 228 56 L204 90 Z" fill={`url(#${body})`} />
        <ellipse cx="200" cy="164" rx="30" ry="32" fill={`url(#${body})`} />
        <circle cx="200" cy="124" r="40" fill={`url(#${body})`} />
      </g>
      <path d="M172 96 L168 70 L188 92 Z" fill="#C77DA0" opacity=".75" />
      <path d="M228 96 L232 70 L212 92 Z" fill="#C77DA0" opacity=".75" />
      <ellipse
        cx="184"
        cy="104"
        rx="12"
        ry="7"
        transform="rotate(-30 184 104)"
        fill="#fff"
        opacity=".18"
        filter={`url(#${blur})`}
      />
      <ellipse cx="186" cy="124" rx="11" ry="12" fill="#fff" />
      <ellipse cx="214" cy="124" rx="11" ry="12" fill="#fff" />
      <circle cx="188" cy="126" r="6.5" fill="#231A22" />
      <circle cx="212" cy="126" r="6.5" fill="#231A22" />
      <circle cx="190.5" cy="123" r="2.3" fill="#fff" />
      <circle cx="214.5" cy="123" r="2.3" fill="#fff" />
      <path
        d="M193 142 Q200 147 207 142"
        stroke="#1A141E"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M195 143.5 L197 150 L199 144.5 Z M201 144.5 L203 150 L205 143.5 Z" fill="#fff" />
      <ellipse
        cx="172"
        cy="138"
        rx="9"
        ry="5"
        fill="#F29CBD"
        opacity=".55"
        filter={`url(#${blur})`}
      />
      <ellipse
        cx="228"
        cy="138"
        rx="9"
        ry="5"
        fill="#F29CBD"
        opacity=".55"
        filter={`url(#${blur})`}
      />
      <path
        d="M190 194 l-4 8 M210 194 l4 8"
        stroke="#2A2230"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}
