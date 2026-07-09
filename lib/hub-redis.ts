import Redis from 'ioredis';
import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

// Presence entries whose heartbeat is older than this are swept on read, so
// a dead serverless instance cannot strand ghost members for long.
const HEARTBEAT_STALE_MS = 60_000;

const globalStore = globalThis as unknown as { __emojigramRedisPub?: Redis };

function pub(): Redis {
  return (globalStore.__emojigramRedisPub ??= new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 2,
  }));
}

const channel = (roomId: string) => `room:${roomId}`;
const presenceKey = (roomId: string) => `presence:${roomId}`;
const heartbeatKey = (roomId: string) => `presence-hb:${roomId}`;

async function sweepStale(roomId: string): Promise<void> {
  const cutoff = Date.now() - HEARTBEAT_STALE_MS;
  const stale = await pub().zrangebyscore(heartbeatKey(roomId), '-inf', cutoff);
  if (stale.length > 0) {
    await pub().hdel(presenceKey(roomId), ...stale);
    await pub().zrem(heartbeatKey(roomId), ...stale);
  }
}

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  await pub().publish(channel(roomId), JSON.stringify(event));
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  await sweepStale(roomId);
  const raw = await pub().hvals(presenceKey(roomId));
  return raw.flatMap((value) => {
    try {
      return [JSON.parse(value) as PresenceMember];
    } catch {
      return []; // corrupt entry: skip rather than break presence for the room
    }
  });
}

export async function memberCount(roomId: string): Promise<number> {
  await sweepStale(roomId);
  return pub().hlen(presenceKey(roomId));
}

export async function touchPresence(roomId: string, userId: string): Promise<void> {
  await pub().zadd(heartbeatKey(roomId), Date.now(), userId);
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  // One subscriber connection per SSE stream; quit on leave.
  const sub = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2 });
  try {
    sub.on('message', (_channel, message) => {
      try {
        subscriber(JSON.parse(message) as RoomEvent);
      } catch {
        // Dead client mid-write; leave() cleans up on disconnect.
      }
    });
    await sub.subscribe(channel(roomId));

    // Heartbeat zset first: any partial-failure orphan is then zset-only
    // (absent from hvals/hlen) and is reclaimed by the next sweepStale.
    await touchPresence(roomId, member.userId);
    await pub().hset(presenceKey(roomId), member.userId, JSON.stringify(member));
    await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });
  } catch (error) {
    sub.disconnect();
    // Roll back any presence we may have written so no ghost survives.
    try {
      await pub().hdel(presenceKey(roomId), member.userId);
      await pub().zrem(heartbeatKey(roomId), member.userId);
    } catch {
      // best-effort rollback; a zset-only remnant would age out via sweepStale
    }
    throw error;
  }

  return async () => {
    sub.disconnect();
    await pub().hdel(presenceKey(roomId), member.userId);
    await pub().zrem(heartbeatKey(roomId), member.userId);
    await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });
  };
}
