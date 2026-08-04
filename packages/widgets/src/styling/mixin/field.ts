import type { CSSProperties, StyleRule } from '@vanilla-extract/css'
import { border, color, font, rem, transition } from '../lib'
import { vars } from '../themes/contract.css'
import { focusRing } from './focusRing'

/**
 * Общая внешность полей ввода. Вынесено в миксин, потому что одинаковую
 * рамку/подложку/фокус носят четыре разных нативных элемента
 * (`input`, `textarea`, `select`, кнопка выбора файла), а наследовать
 * стили между атомами нечем.
 */

/** Минимальная высота контрола — 44px, нижняя граница комфортного тапа. */
export const FIELD_HEIGHT = 44

/**
 * Поля — пилюли (`radius.pill`) с волосяной рамкой: референс не допускает
 * прямых углов у контролов, стоящих в строке с текстом. Круглым краям нужны
 * увеличенные горизонтальные отступы, иначе текст липнет к дуге.
 */
export function fieldControl(): StyleRule {
  return {
    width: '100%',
    minHeight: rem(FIELD_HEIGHT),
    padding: `${vars.space.xs} ${vars.space.md}`,
    font: font('16/24'),
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('subtle')),
    borderRadius: vars.radius.pill,
    transition: transition('border-color', 'box-shadow', 'background-color'),
    selectors: {
      '&:hover:not(:disabled)': {
        borderColor: color.border('strong'),
      },
      '&:focus-visible': {
        ...focusRing(),
        borderColor: color.border('focus'),
      },
      '&:disabled': {
        backgroundColor: color.surface('sunken'),
        color: color.text('muted'),
        cursor: 'not-allowed',
      },
    },
  }
}

/**
 * То же самое, но для обёртки вокруг `input` — когда рядом с полем живут
 * префикс/суффикс (иконка, «+996», кнопка «показать пароль»). Рамка рисуется
 * на обёртке, поэтому подсветка идёт по `:focus-within`, а не по `:focus-visible`.
 */
export function fieldShell(): StyleRule {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.xs,
    width: '100%',
    minHeight: rem(FIELD_HEIGHT),
    padding: `0 ${vars.space.md}`,
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('subtle')),
    borderRadius: vars.radius.pill,
    transition: transition('border-color', 'box-shadow', 'background-color'),
    selectors: {
      '&:hover': { borderColor: color.border('strong') },
      '&:focus-within': {
        ...focusRing(),
        borderColor: color.border('focus'),
      },
    },
  }
}

/** Состояние ошибки. Накладывается поверх `fieldControl`/`fieldShell` отдельным классом. */
export function fieldInvalid(): StyleRule {
  return {
    borderColor: color.danger('500'),
    selectors: {
      '&:hover': {
        borderColor: color.danger('700'),
      },
    },
  }
}

/** Голый `input` внутри `fieldShell` — рамку и подложку рисует обёртка. */
export function fieldInput(): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    padding: 0,
    font: font('16/24'),
    color: 'inherit',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
  }
}

export function fieldLabel(): CSSProperties {
  return {
    display: 'block',
    font: font('14/20', 500),
    color: color.text('secondary'),
  }
}

/** Подсказка под полем. 12px — нижняя граница шкалы для вторичного текста. */
export function fieldHint(): CSSProperties {
  return {
    font: font('12/18'),
    color: color.text('muted'),
  }
}

/** Текст ошибки под полем; читается скринридером через `aria-describedby`. */
export function fieldError(): CSSProperties {
  return {
    font: font('12/18', 500),
    color: color.text('danger'),
  }
}
