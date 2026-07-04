import '../src/styling/preflight.css'
import '../src/styling/global.css'
import { breakpoints } from '../src/breakpoints'
import { themes } from '@storybook/theming'

const compiledViewports = Object.keys(breakpoints).reduce((carry, key) => {
  const keyAs = key as keyof typeof breakpoints
  carry[key] = {
    name: key.toUpperCase(),
    styles: {
      width: `${breakpoints[keyAs]}px`,
      height: '100%',
    },
  }
  return carry
}, {} as Record<string, any>)

export const parameters = {
  layout: 'fullscreen',
  actions: { argTypesRegex: '^on[A-Z].*' },
  darkMode: {
    dark: themes.dark,
    light: themes.normal,
    current: 'light',
  },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  viewport: {
    viewports: {
      ...compiledViewports,
      mobile: { name: 'mobile', styles: { width: '375px', height: '667px' } },
    },
  },
}
