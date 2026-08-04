import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Билдер — vite, конфиг берётся из `vite.config.ts` пакета: там уже
 * подключены плагины vanilla-extract, react и svgr, дублировать их здесь
 * не нужно.
 */
const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-a11y'],
}

export default config
