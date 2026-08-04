import { describe, expect, it } from 'vitest'
import { focusSmoke, hiddenSmoke, layoutSmoke, textSmoke, tokenSmoke } from './styling.smoke.css'
import { lightThemeStyle } from './themes/light.css'
import { lightTokens } from './themes/tokens'
import { vars } from './themes/contract.css'

type ITokenTree = { [key: string]: ITokenTree | string }

function leafPaths(tree: ITokenTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key

    return typeof value === 'string' ? [path] : leafPaths(value, path)
  })
}

describe('тема', () => {
  it('собирается: createTheme не падает на расхождении контракта и значений', () => {
    expect(lightThemeStyle).toBeTruthy()
  })

  it('контракт и значения совпадают ключами один в один', () => {
    expect(leafPaths(vars as unknown as ITokenTree)).toEqual(
      leafPaths(lightTokens as unknown as ITokenTree),
    )
  })

  it('каждый цвет хранится каналами "R, G, B" — этого требует геттер color()', () => {
    const CHANNELS = /^\d{1,3}, \d{1,3}, \d{1,3}$/

    for (const [group, shades] of Object.entries(lightTokens.color)) {
      for (const [shade, value] of Object.entries(shades)) {
        expect(value, `${group}.${shade}`).toMatch(CHANNELS)
      }
    }
  })
})

describe('миксины', () => {
  it('компилируются в валидный css', () => {
    for (const className of [layoutSmoke, textSmoke, focusSmoke, hiddenSmoke, tokenSmoke]) {
      expect(className).toBeTruthy()
    }
  })
})
