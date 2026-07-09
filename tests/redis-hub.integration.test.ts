import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;

describe.skipIf(!REDIS_TEST_URL)('redis hub (integration)', () => {
  let hub: typeof import('@/lib/hub-redis');
  let rateLimit: typeof import('@/lib/rateLimit');

  beforeAll(async () => {
    process.env.REDIS_URL = REDIS_TEST_URL;
    hub = await import('@/lib/hub-redis');
    rateLimit = await import('@/lib/rateLimit');
  });

  afterAll(async () => {
    // Leave connections to process exit; keys used below are self-cleaning
    // (leave() removes presence; rate keys expire).
  });

  const member = (id: string) => ({ userId: id, displayName: id, avatarEmoji: '🦖' });

  it('broadcasts across two independent subscribers', async () => {
    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    const leaveA = await hub.join('itest-room', member('a'), (e) => gotA.push(e));
    const leaveB = await hub.join('itest-room', member('b'), (e) => gotB.push(e));

    await hub.broadcast('itest-room', { type: 'presence', members: [] });
    await new Promise((resolve) => setTimeout(resolve, 300)); // pub/sub delivery

    expect(gotA.length).toBeGreaterThan(0);
    expect(gotB.length).toBeGreaterThan(0);
    await leaveA();
    await leaveB();
  });

  it('tracks presence and sweeps stale heartbeats', async () => {
    const leave = await hub.join('itest-sweep', member('sweeper'), () => {});
    expect(await hub.memberCount('itest-sweep')).toBe(1);

    // Backdate the heartbeat past the 60s staleness window, then read.
    const Redis = (await import('ioredis')).default;
    const raw = new Redis(REDIS_TEST_URL!);
    await raw.zadd('presence-hb:itest-sweep', Date.now() - 120_000, 'sweeper');
    expect(await hub.memberCount('itest-sweep')).toBe(0);
    raw.disconnect();
    await leave();
  });

  it('rate limits across calls and expires', async () => {
    const id = `itest-rl-${Math.floor(Date.now() / 1000)}`;
    expect(await rateLimit.checkRateLimit(id)).toBe(true);
    expect(await rateLimit.checkRateLimit(id)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(await rateLimit.checkRateLimit(id)).toBe(true);
  }, 10_000);
});
