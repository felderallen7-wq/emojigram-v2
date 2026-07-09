import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { broadcast } from '@/lib/sse';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id: roomId } = await params;
  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { displayName: true, avatarEmoji: true } } },
  });
  return NextResponse.json(messages.reverse());
}

export async function POST(req: Request, { params }: Ctx) {
  const { id: roomId } = await params;
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!userId || !text) {
    return NextResponse.json({ error: 'userId and non-empty text are required' }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
  }

  const [user, room] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.room.findUnique({ where: { id: roomId } }),
  ]);
  if (!user || !room) {
    return NextResponse.json({ error: 'Unknown user or room' }, { status: 404 });
  }

  if (!(await checkRateLimit(userId))) {
    return NextResponse.json(
      { error: 'Slow down — one message every 2 seconds' },
      { status: 429 },
    );
  }

  // Send path stores text only; emoji translation happens at first display
  // via GET /api/messages/[id]/emoji.
  const message = await prisma.message.create({
    data: { roomId, userId, originalText: text },
  });

  try {
    await broadcast(roomId, {
      type: 'message',
      message: {
        id: message.id,
        roomId,
        userId,
        displayName: user.displayName,
        avatarEmoji: user.avatarEmoji,
        originalText: message.originalText,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('broadcast failed; message persisted, delivery degrades to refetch', error);
  }

  return NextResponse.json(message, { status: 201 });
}
