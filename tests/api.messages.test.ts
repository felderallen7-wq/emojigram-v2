import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMessages, POST as postMessage } from '@/app/api/rooms/[id]/messages/route';
import { prisma } from '@/lib/prisma';
import { resetRateLimits } from '@/lib/rateLimit';
import { join, type RoomEvent } from '@/lib/sse';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function post(roomId: string, body: unknown): Promise<Response> {
  return postMessage(
    new Request(`http://test/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(roomId),
  );
}

async function fixtures() {
  const user = await prisma.user.create({ data: { displayName: 'M', avatarEmoji: '🐧' } });
  const room = await prisma.room.upsert({
    where: { id: 'msg-test' },
    update: {},
    create: { id: 'msg-test', name: 'Msg Test', emoji: '🧪', description: 'x' },
  });
  return { user, room };
}

describe('POST /api/rooms/[id]/messages', () => {
  beforeEach(() => resetRateLimits());

  it('stores text as-is (no translation in the send path) and broadcasts', async () => {
    const { user, room } = await fixtures();
    const events: RoomEvent[] = [];
    const leave = await join(room.id, { userId: 'observer', displayName: 'O', avatarEmoji: '👀' },
      (e) => events.push(e));

    const res = await post(room.id, { userId: user.id, text: 'pizza tonight?' });
    expect(res.status).toBe(201);
    const message = await res.json();
    expect(message.originalText).toBe('pizza tonight?');
    expect(message.emojiText).toBeNull();

    const msgEvent = events.find((e) => e.type === 'message');
    expect(msgEvent && msgEvent.type === 'message' && msgEvent.message.originalText)
      .toBe('pizza tonight?');
    await leave();
  });

  it('rejects empty, whitespace-only, and oversized messages', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: user.id, text: '' })).status).toBe(400);
    expect((await post(room.id, { userId: user.id, text: '   ' })).status).toBe(400);
    expect((await post(room.id, { userId: user.id, text: 'x'.repeat(501) })).status).toBe(400);
  });

  it('404s for unknown user or room', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: 'nope', text: 'hi' })).status).toBe(404);
    expect((await post('no-room', { userId: user.id, text: 'hi' })).status).toBe(404);
  });

  it('rate limits a second message within 2 seconds', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: user.id, text: 'one' })).status).toBe(201);
    expect((await post(room.id, { userId: user.id, text: 'two' })).status).toBe(429);
  });
});

describe('GET /api/rooms/[id]/messages', () => {
  it('returns messages oldest-first with sender info', async () => {
    const { user, room } = await fixtures();
    await prisma.message.deleteMany({ where: { roomId: room.id } });
    await prisma.message.create({ data: { roomId: room.id, userId: user.id, originalText: 'first' } });
    await prisma.message.create({ data: { roomId: room.id, userId: user.id, originalText: 'second' } });

    const res = await getMessages(
      new Request(`http://test/api/rooms/${room.id}/messages`), ctx(room.id));
    expect(res.status).toBe(200);
    const messages = await res.json();
    expect(messages.at(-1).originalText).toBe('second');
    expect(messages.at(-1).user.avatarEmoji).toBe('🐧');
  });
});
