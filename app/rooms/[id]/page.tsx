'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Composer from '@/components/Composer';
import MessageBubble from '@/components/MessageBubble';
import PresenceStrip from '@/components/PresenceStrip';
import { useRoomStream } from '@/hooks/useRoomStream';
import { loadIdentity, type Identity } from '@/lib/identity';

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const [identity] = useState<Identity | null>(() =>
    typeof window === 'undefined' ? null : loadIdentity(),
  );
  const { messages, members } = useRoomStream(roomId, identity);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identity) router.replace('/');
  }, [identity, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string): Promise<string | null> {
    if (!identity) return 'Not signed in';
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: identity.userId, text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return body?.error ?? 'Failed to send';
    }
    return null; // message arrives via the SSE echo
  }

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <Link href="/rooms" className="text-sm text-violet-600">← Rooms</Link>
        <PresenceStrip members={members} />
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.userId === identity?.userId}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <Composer onSend={send} />
    </main>
  );
}
