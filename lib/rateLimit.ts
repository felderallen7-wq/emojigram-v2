import Redis from 'ioredis';

const WINDOW_MS = 2_000;

const globalStore = globalThis as unknown as {
  __rateLimits?: Map<string, number>;
  __rateLimitRedis?: Redis;
};
const lastAllowed = (globalStore.__rateLimits ??= new Map<string, number>());

function redis(): Redis {
  return (globalStore.__rateLimitRedis ??= new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 2,
  }));
}

export async function checkRateLimit(userId: string, now: number = Date.now()): Promise<boolean> {
  if (process.env.REDIS_URL) {
    try {
      // Allowed iff the key did not exist; it self-expires after the window.
      const result = await redis().set(`rate:${userId}`, '1', 'PX', WINDOW_MS, 'NX');
      return result === 'OK';
    } catch {
      return true; // fail open: availability over strictness for a demo app
    }
  }
  const last = lastAllowed.get(userId);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  lastAllowed.set(userId, now);
  return true;
}

export function resetRateLimits(): void {
  lastAllowed.clear();
}
