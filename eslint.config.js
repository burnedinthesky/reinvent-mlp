//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      '.claude/**',
      'eslint.config.js',
      'prettier.config.js',
      'design_handoff_mlp_workshop/**',
      'sitcon-camp-2026-ml-pt2/**',
      '.output/**',
      '.nitro/**',
    ],
  },
]
