import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { translate } from '@/lib/translate';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if (message.emojiText) {
    return NextResponse.json({ emoji: message.emojiText, fallback: false, cached: true });
  }

  const { emoji, fallback } = await translate(message.originalText);
  if (!fallback) {
    // Persist only real translations; fallbacks stay uncached so a later
    // view retries the full pipeline once Claude is reachable again.
    await prisma.message.update({ where: { id }, data: { emojiText: emoji } });
  }
  return NextResponse.json({ emoji, fallback, cached: false });
}
