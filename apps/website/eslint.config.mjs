// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import tsEslintPlugin from '@typescript-eslint/eslint-plugin'
import tsEslintParser from '@typescript-eslint/parser'
import rootConfig from '../../eslint.config.mjs'
import configPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import { FlatCompat } from '@eslint/eslintrc'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

export default [
  {
    ignores: ['node_modules/', 'dist/', 'build/', '**/*.min.js', 'next.config.js'],
  },
  ...rootConfig,
  configPrettier,
  js.configs.recommended,
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
      react: reactPlugin,
      import: importPlugin,
      next: nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ecmaVersion: 'latest',
        project: './tsconfig.json',
      },
    },
    rules: {
      'import/no-internal-modules': [
        'error',
        {
          forbid: ['widgets/src/*'],
        },
      ],
      'import/no-absolute-path': 'error',
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          project: 'apps/website',
        },
      },
    },
  },
  {
    files: ['next.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      parserOptions: {
        ecmaVersion: 'latest',
      },
    },
  },
]
