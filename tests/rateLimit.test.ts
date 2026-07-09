import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimits } from '@/lib/rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows the first message', async () => {
    expect(await checkRateLimit('u1', 1_000)).toBe(true);
  });

  it('blocks a second message within 2 seconds', async () => {
    await checkRateLimit('u1', 1_000);
    expect(await checkRateLimit('u1', 2_500)).toBe(false);
  });

  it('allows again after the window', async () => {
    await checkRateLimit('u1', 1_000);
    expect(await checkRateLimit('u1', 3_000)).toBe(true);
  });

  it('tracks users independently', async () => {
    await checkRateLimit('u1', 1_000);
    expect(await checkRateLimit('u2', 1_100)).toBe(true);
  });

  it('a blocked attempt does not extend the window', async () => {
    await checkRateLimit('u1', 1_000);
    await checkRateLimit('u1', 2_500); // blocked
    expect(await checkRateLimit('u1', 3_000)).toBe(true); // 2s after the ALLOWED send
  });
});
