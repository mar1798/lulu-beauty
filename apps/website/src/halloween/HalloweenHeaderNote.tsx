import React from 'react'
import { HALLOWEEN_ENABLED } from './config'
import * as styles from './halloween.css'

/**
 * «Happy Halloween» рядом с логотипом в шапке (слот `logoNote`).
 *
 * В разметке — при включённом флаге всегда, а видна — по атрибуту
 * `data-halloween`, как фон и паутинки, а не через `useHalloween`: шапка в
 * первом кадре, и подпись, появившаяся после гидрации, сдвинула бы навигацию.
 * Атрибут ставит ранний скрипт с той же проверкой даты, так что после
 * `HALLOWEEN_UNTIL` подписи нет и без релиза.
 */
export const HalloweenHeaderNote: React.FC = () =>
  HALLOWEEN_ENABLED ? (
    <span className={styles.headerNote} aria-hidden={true}>
      Happy Halloween
    </span>
  ) : null
