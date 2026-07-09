import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getEmoji } from '@/app/api/messages/[id]/emoji/route';
import { prisma } from '@/lib/prisma';
import { clearTranslationCache } from '@/lib/translate';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://test/api/messages/${id}/emoji`);

async function makeMessage(originalText: string, emojiText?: string) {
  const user = await prisma.user.create({ data: { displayName: 'E', avatarEmoji: '🐳' } });
  const room = await prisma.room.upsert({
    where: { id: 'emoji-test' },
    update: {},
    create: { id: 'emoji-test', name: 'Emoji Test', emoji: '🧪', description: 'x' },
  });
  return prisma.message.create({
    data: { roomId: room.id, userId: user.id, originalText, emojiText },
  });
}

describe('GET /api/messages/[id]/emoji', () => {
  beforeEach(() => clearTranslationCache());

  it('404s for an unknown message', async () => {
    expect((await getEmoji(req('nope'), ctx('nope'))).status).toBe(404);
  });

  it('returns the stored emojiText without re-translating', async () => {
    const message = await makeMessage('pizza', '🍕');
    const res = await getEmoji(req(message.id), ctx(message.id));
    expect(await res.json()).toEqual({ emoji: '🍕', fallback: false, cached: true });
  });

  it('translates on first request; fallback results are not persisted', async () => {
    const message = await makeMessage('pizza tonight');
    const res = await getEmoji(req(message.id), ctx(message.id));
    // No API key in the test env -> dictionary fallback
    expect(await res.json()).toEqual({ emoji: '🍕🌙', fallback: true, cached: false });

    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stored?.emojiText).toBeNull(); // NOT cached, so a later view can retry Claude

    const again = await getEmoji(req(message.id), ctx(message.id));
    expect((await again.json()).cached).toBe(false);
  });

  it('persists pass-through translations of already-emoji messages', async () => {
    const message = await makeMessage('🎉🎉');
    const res = await getEmoji(req(message.id), ctx(message.id));
    expect(await res.json()).toEqual({ emoji: '🎉🎉', fallback: false, cached: false });
    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stored?.emojiText).toBe('🎉🎉'); // fallback=false -> persisted
  });
});
