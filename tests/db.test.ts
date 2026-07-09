import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';

describe('database', () => {
  it('creates and reads a user', async () => {
    const user = await prisma.user.create({
      data: { displayName: 'Test', avatarEmoji: '🦖' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.displayName).toBe('Test');
    expect(found?.avatarEmoji).toBe('🦖');
  });

  it('stores messages with nullable emojiText', async () => {
    const user = await prisma.user.create({ data: { displayName: 'T2', avatarEmoji: '🐙' } });
    const room = await prisma.room.create({
      data: { id: 'test-room', name: 'Test', emoji: '🧪', description: 'x' },
    });
    const message = await prisma.message.create({
      data: { roomId: room.id, userId: user.id, originalText: 'hello' },
    });
    expect(message.emojiText).toBeNull();
  });
});
