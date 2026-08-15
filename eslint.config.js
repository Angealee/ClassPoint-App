import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * ESLint, finally actually running.
 *
 * This codebase already had 12 `eslint-disable` comments before it had a
 * linter — suppressions for a rule that had never executed. That matters more
 * than usual here, because the central architectural technique is *deliberately*
 * lying about dependency arrays and compensating with refs (loadRef,
 * achievementsRef, semesterIdRef, inFlightRef, …). `react-hooks` is exactly the
 * tool that tells you when one of those workarounds has gone stale.
 *
 * Rules start as WARNINGS on purpose (Era 5.0 Phase C decision): the goal of
 * this pass is to read what it finds, fix what's genuinely broken, and only then
 * tighten to errors. `npm run build` remains the hard gate meanwhile.
 */
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage'] },

  // The app: browser globals, type-aware-lite TS rules, hooks correctness.
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

      // Everything starts soft — see the note above. First run on this codebase:
      //   33 set-state-in-effect · 7 purity · 4 exhaustive-deps · 3 refs · 2 misc
      // The 4 exhaustive-deps are the ones worth reading (they're the class of
      // bug the ref-workarounds exist to dodge). set-state-in-effect and purity
      // are react-hooks v7 PERFORMANCE opinions, not correctness failures — the
      // purity hits are all Math.random() inside decorative confetti/sparkles,
      // where instability across renders is invisible by design.
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

      // An empty catch must SAY why it's empty. Most of the ~15 in this
      // codebase already do; this keeps the next one honest.
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // console.error/warn are used deliberately for diagnosable failures
      // (push delivery, auth events); bare console.log is the accident.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Fires on `let x = null` immediately reassigned inside a try/catch —
      // a deliberate, readable shape for "parse this, fall back on garbage".
      // Two hits, both correct code; not worth restructuring.
      'no-useless-assignment': 'warn',
    },
  },

  // Tests: vitest globals arrive via imports, but Node globals are fair game.
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Deno edge functions have their own runtime and module resolution; linting
  // them with the browser config produces only noise.
  { ignores: ['supabase/functions/**'] },
)
