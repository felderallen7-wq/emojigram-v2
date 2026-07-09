import { describe, expect, it } from 'vitest';
import { POST as createUser } from '@/app/api/users/route';
import { GET as listRooms } from '@/app/api/rooms/route';
import { prisma } from '@/lib/prisma';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/users', () => {
  it('creates a guest user', async () => {
    const res = await createUser(
      jsonRequest('http://test/api/users', { displayName: 'Allen', avatarEmoji: '🦈' }),
    );
    expect(res.status).toBe(201);
    const user = await res.json();
    expect(user.id).toBeTruthy();
    expect(user.displayName).toBe('Allen');
  });

  it('rejects missing or oversized fields', async () => {
    for (const body of [
      {},
      { displayName: '', avatarEmoji: '🦈' },
      { displayName: 'x'.repeat(31), avatarEmoji: '🦈' },
      { displayName: 'ok', avatarEmoji: '' },
    ]) {
      const res = await createUser(jsonRequest('http://test/api/users', body));
      expect(res.status).toBe(400);
    }
  });

  it('rejects malformed JSON', async () => {
    const res = await createUser(
      new Request('http://test/api/users', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms', () => {
  it('lists rooms with latest message and member count', async () => {
    const room = await prisma.room.upsert({
      where: { id: 'rooms-test' },
      update: {},
      create: { id: 'rooms-test', name: 'Rooms Test', emoji: '🧪', description: 'x' },
    });
    const user = await prisma.user.create({ data: { displayName: 'R', avatarEmoji: '🐟' } });
    await prisma.message.create({
      data: { roomId: room.id, userId: user.id, originalText: 'hi', emojiText: '👋' },
    });

    const res = await listRooms();
    expect(res.status).toBe(200);
    const rooms = await res.json();
    const found = rooms.find((r: { id: string }) => r.id === 'rooms-test');
    expect(found.latestMessage.emojiText).toBe('👋');
    expect(found.memberCount).toBe(0);
  });
});
