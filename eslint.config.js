import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { fetch: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  ...tseslint.configs.recommended,
  prettier,
);
