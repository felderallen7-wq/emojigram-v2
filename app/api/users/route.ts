import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const displayName =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const avatarEmoji =
    typeof body?.avatarEmoji === 'string' ? body.avatarEmoji.trim() : '';

  if (!displayName || displayName.length > 30 || !avatarEmoji || avatarEmoji.length > 8) {
    return NextResponse.json(
      { error: 'displayName (1-30 chars) and avatarEmoji are required' },
      { status: 400 },
    );
  }

  const user = await prisma.user.create({ data: { displayName, avatarEmoji } });
  return NextResponse.json(user, { status: 201 });
}
