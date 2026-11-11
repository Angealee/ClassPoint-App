import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'no-empty': ['warn', { allowEmptyCatch: true }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],

      'no-useless-assignment': 'warn',
    },
  },

  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  { ignores: ['supabase/functions/**'] },
)
