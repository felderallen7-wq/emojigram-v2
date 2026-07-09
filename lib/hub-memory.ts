import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  // Presence keyed by userId: same user in two tabs counts once and leaves
  // when either tab closes. Acceptable for the MVP.
  presence: Map<string, Map<string, PresenceMember>>;
};

const globalStore = globalThis as unknown as { __emojigramHub?: Hub };
const hub = (globalStore.__emojigramHub ??= {
  subscribers: new Map(),
  presence: new Map(),
});

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  for (const subscriber of hub.subscribers.get(roomId) ?? []) {
    try {
      subscriber(event);
    } catch {
      // Dead client mid-write; its unsubscribe cleans up on disconnect.
    }
  }
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  return [...(hub.presence.get(roomId)?.values() ?? [])];
}

export async function memberCount(roomId: string): Promise<number> {
  return hub.presence.get(roomId)?.size ?? 0;
}

export async function touchPresence(_roomId: string, _userId: string): Promise<void> {
  // In-memory presence has no heartbeats; entries live exactly as long as
  // their subscription.
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  let subs = hub.subscribers.get(roomId);
  if (!subs) hub.subscribers.set(roomId, (subs = new Set()));
  subs.add(subscriber);

  let members = hub.presence.get(roomId);
  if (!members) hub.presence.set(roomId, (members = new Map()));
  members.set(member.userId, member);
  await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });

  return async () => {
    subs.delete(subscriber);
    hub.presence.get(roomId)?.delete(member.userId);
    await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });
  };
}
