export default [
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          "allowExpressions": true,
          "allowDirectConstAssertionInArrowFunctions": true
        }
      ],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-import-type-side-effects": "off",
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/sort-type-constituents": "off",
      "@typescript-eslint/no-type-alias": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/naming-convention": "off"
    }
  }
];
