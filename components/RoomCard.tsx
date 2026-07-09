import Link from 'next/link';

export type RoomSummary = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  latestMessage: { emojiText: string | null; createdAt: string } | null;
  memberCount: number;
};

export default function RoomCard({ room }: { room: RoomSummary }) {
  return (
    <Link
      href={`/rooms/${room.id}`}
      data-testid={`room-card-${room.id}`}
      className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 transition hover:border-violet-400 hover:shadow"
    >
      <span aria-hidden="true" className="text-3xl">{room.emoji}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{room.name}</h2>
        <p className="truncate text-sm text-gray-500">
          {room.latestMessage?.emojiText ?? room.description}
        </p>
      </div>
      {room.memberCount > 0 && (
        <span className="text-sm text-gray-400" aria-label={`${room.memberCount} online`}>
          🟢 {room.memberCount}
        </span>
      )}
    </Link>
  );
}
