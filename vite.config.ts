import { defineConfig } from 'vitest/config';

// GitHub Pagesではリポジトリ名のサブパスで配信されるためbaseを差し替える
export default defineConfig({
  base: process.env.DENTAKU_BASE ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
