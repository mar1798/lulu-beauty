// @ts-nocheck
import  js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import tsEslintPlugin from '@typescript-eslint/eslint-plugin'
import tsEslintParser from '@typescript-eslint/parser'
import rootConfig from '../../eslint.config.mjs'
import configPrettier from 'eslint-config-prettier'
import importPlugin from "eslint-plugin-import";
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import { fixupPluginRules } from "@eslint/compat";

export default [
    {
        ignores: ["**/tools", "**/node_modules", "**/storybook-static", "**/*.stories.tsx" ],
    },
    ...rootConfig,
    configPrettier,
    js.configs.recommended,
    {
        plugins: {
            "@typescript-eslint": tsEslintPlugin,
            react: reactPlugin,
            import: importPlugin,
            "react-hooks": fixupPluginRules(reactHooksPlugin)
        },
        languageOptions: {
            parser: tsEslintParser,
            parserOptions: {
                ecmaVersion: 'latest',
                project: './tsconfig.json',
            },
        },
        rules: {
            "import/no-absolute-path": "error",
            "react/function-component-definition": [
                "error",
                {
                    "namedComponents": "arrow-function",
                    "unnamedComponents": "arrow-function"
                }
            ],
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off"
        },
        settings: {
            "react": {
                "version": "detect"
            }
        }
    }
];
