import type { PresenceMember } from '@/lib/sse';

export default function PresenceStrip({ members }: { members: PresenceMember[] }) {
  return (
    <div className="flex items-center gap-1 text-lg" title={members.map((m) => m.displayName).join(', ')}>
      {members.slice(0, 8).map((m) => (
        <span key={m.userId}>{m.avatarEmoji}</span>
      ))}
      {members.length > 8 && <span className="text-xs text-gray-400">+{members.length - 8}</span>}
    </div>
  );
}
