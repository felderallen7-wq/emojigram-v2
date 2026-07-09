import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ROOMS = [
  { id: 'food', name: 'Food Talk', emoji: '🍕', description: 'What are you eating?' },
  { id: 'movies', name: 'Movies', emoji: '🎬', description: 'Now showing' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮', description: 'GG only' },
  { id: 'random', name: 'Random', emoji: '💬', description: 'Anything goes' },
];

async function main() {
  for (const room of ROOMS) {
    await prisma.room.upsert({ where: { id: room.id }, update: room, create: room });
  }
}

main().finally(() => prisma.$disconnect());
