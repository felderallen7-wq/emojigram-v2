import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { memberCount } from '@/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rooms = await prisma.room.findMany({
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const withCounts = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      name: room.name,
      emoji: room.emoji,
      description: room.description,
      latestMessage: room.messages[0]
        ? { emojiText: room.messages[0].emojiText, createdAt: room.messages[0].createdAt }
        : null,
      memberCount: await memberCount(room.id),
    })),
  );
  return NextResponse.json(withCounts);
}
