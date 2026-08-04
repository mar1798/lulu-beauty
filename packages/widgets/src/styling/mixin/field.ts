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

export function fieldControl(): StyleRule {
  return {
    width: '100%',
    minHeight: rem(FIELD_HEIGHT),
    padding: `${vars.space.xs} ${vars.space.sm}`,
    font: font('15/22'),
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('default')),
    borderRadius: vars.radius.sm,
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
    padding: `0 ${vars.space.sm}`,
    color: color.text('primary'),
    backgroundColor: color.surface('base'),
    border: border(1, color.border('default')),
    borderRadius: vars.radius.sm,
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
    font: font('15/22'),
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

/** Подсказка под полем. */
export function fieldHint(): CSSProperties {
  return {
    font: font('13/18'),
    color: color.text('muted'),
  }
}

/** Текст ошибки под полем; читается скринридером через `aria-describedby`. */
export function fieldError(): CSSProperties {
  return {
    font: font('13/18', 500),
    color: color.text('danger'),
  }
}
