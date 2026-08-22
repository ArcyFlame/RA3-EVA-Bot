const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');

const nodeGlobals = {
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  NodeJS: 'readonly',
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  URL: 'readonly',
};

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'data/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: { project: './tsconfig.json' },
      globals: nodeGlobals,
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // TypeScript already performs identifier resolution — the base rule
      // only produces false positives on Node globals and types.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 'warn' during the type-hardening transition; goal is 'error'.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-var-requires': 'off', // dynamic command/component loader uses require
      'no-console': 'warn', // use utils/logger instead
    },
  },
];
