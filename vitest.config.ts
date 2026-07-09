import { defineConfig, configDefaults } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/emojigram_test',
      ANTHROPIC_API_KEY: '',
      REDIS_URL: '',
    },
    globalSetup: './tests/globalSetup.ts',
    exclude: [...configDefaults.exclude, '**/e2e/**'],
  },
});
