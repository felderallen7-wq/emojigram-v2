import * as memory from './hub-memory';
import * as redis from './hub-redis';
import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

export type { BroadcastMessage, Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

let warnedNoRedis = false;

function backend() {
  if (process.env.REDIS_URL) return redis;
  if (process.env.NODE_ENV === 'production' && !warnedNoRedis) {
    warnedNoRedis = true;
    console.error(
      'MISCONFIGURATION: REDIS_URL is not set in production. Realtime falls back to ' +
        'the in-memory hub, which is per-instance and will be silently wrong across ' +
        'serverless instances. Set REDIS_URL to your Upstash Redis connection string.',
    );
  }
  return memory;
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  return backend().join(roomId, member, subscriber);
}

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  return backend().broadcast(roomId, event);
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  return backend().presenceMembers(roomId);
}

export async function memberCount(roomId: string): Promise<number> {
  return backend().memberCount(roomId);
}

export async function touchPresence(roomId: string, userId: string): Promise<void> {
  return backend().touchPresence(roomId, userId);
}
