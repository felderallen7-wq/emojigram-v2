'use client';

import { useEffect, useRef, useState } from 'react';
import type { BroadcastMessage, PresenceMember, RoomEvent } from '@/lib/sse';
import type { Identity } from '@/lib/identity';

export type ChatMessage = {
  id: string;
  userId: string;
  originalText: string;
  createdAt: string;
  user: { displayName: string; avatarEmoji: string };
};

function toChatMessage(m: BroadcastMessage): ChatMessage {
  return {
    id: m.id,
    userId: m.userId,
    originalText: m.originalText,
    createdAt: m.createdAt,
    user: { displayName: m.displayName, avatarEmoji: m.avatarEmoji },
  };
}

export function useRoomStream(roomId: string, identity: Identity | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!identity) return;
    let closed = false;

    const addMessages = (incoming: ChatMessage[]) => {
      const fresh = incoming.filter((m) => !seen.current.has(m.id));
      if (fresh.length === 0) return;
      fresh.forEach((m) => seen.current.add(m.id));
      setMessages((prev) =>
        [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    };

    const refetch = () =>
      fetch(`/api/rooms/${roomId}/messages`)
        .then((res) => res.json())
        .then((history: ChatMessage[]) => !closed && addMessages(history))
        .catch(() => {});

    const qs = new URLSearchParams({
      userId: identity.userId,
      displayName: identity.displayName,
      avatarEmoji: identity.avatarEmoji,
    });
    const source = new EventSource(`/api/rooms/${roomId}/stream?${qs}`);

    // Fires on first connect AND every auto-reconnect: refetch fills any gap.
    source.onopen = () => refetch();
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as RoomEvent;
      if (event.type === 'message') addMessages([toChatMessage(event.message)]);
      if (event.type === 'presence') setMembers(event.members);
    };

    return () => {
      closed = true;
      source.close();
    };
  }, [roomId, identity]);

  return { messages, members };
}
