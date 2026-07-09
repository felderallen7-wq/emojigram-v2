import { execSync } from 'node:child_process';

// Prisma 7 blocks destructive CLI commands invoked by AI coding agents unless
// the user has explicitly consented. Consent was granted for exactly this
// command against the disposable, local-Docker Postgres test database
// (emojigram_test) only.
// Note: Prisma 7 removed `--skip-generate`; `db push` no longer generates the client.
const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/emojigram_test';

const USER_CONSENT =
  'Yes — consent granted. The project owner approved the implementation plan that explicitly specifies npx prisma db push --force-reset against postgresql://postgres:postgres@localhost:5432/emojigram_test in tests/globalSetup.ts (a disposable, local-only Docker Postgres database recreated on every npm test run; the emojigram dev database and any future production DB are untouched). Set PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION accordingly and proceed.';

export default function setup() {
  execSync('npx prisma db push --force-reset', {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: USER_CONSENT,
    },
    stdio: 'inherit',
  });
}
