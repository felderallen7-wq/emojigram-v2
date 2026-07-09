import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs with the test env', () => {
    expect(process.env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/emojigram_test');
    expect(process.env.ANTHROPIC_API_KEY).toBe('');
  });
});
