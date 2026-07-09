import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npx prisma db push && npx prisma db seed && npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/emojigram_e2e',
      REDIS_URL: 'redis://localhost:6379',
      ANTHROPIC_API_KEY: '',
    },
    timeout: 120_000,
  },
});
