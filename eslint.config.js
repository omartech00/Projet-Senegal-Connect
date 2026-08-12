// eslint.config.js
// ESLint >= 9 utilise le "flat config" — l'ancien .eslintrc.json n'est
// plus lu. Reprend les mêmes règles que l'ancien fichier.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-console': 'off',
      eqeqeq: 'error',
      'prefer-const': 'warn',
    },
  },
];
