'use client';

import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/hooks/useRoomStream';

export default function MessageBubble({
  message,
  mine,
}: {
  message: ChatMessage;
  mine: boolean;
}) {
  const [emoji, setEmoji] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages/${message.id}/emoji`)
      .then((res) => {
        if (!res.ok) {
          if (!cancelled) setEmoji('🤷');
          return null;
        }
        return res.json();
      })
      .then((data: { emoji: string; fallback: boolean } | null) => {
        if (cancelled || !data) return;
        setEmoji(data.emoji);
        setFallback(data.fallback);
      })
      .catch(() => !cancelled && setEmoji('🤷'));
    return () => {
      cancelled = true;
    };
  }, [message.id]);

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${mine ? 'text-right' : ''}`}>
        <p className="mb-0.5 text-xs text-gray-400">
          {message.user.avatarEmoji} {message.user.displayName} ·{' '}
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        <button
          type="button"
          data-testid="message-bubble"
          onClick={() => setRevealed((r) => !r)}
          title={revealed ? 'Show emoji' : 'Reveal original text'}
          className={`rounded-2xl px-4 py-2 text-left transition-transform duration-150 active:scale-95 ${
            mine ? 'bg-violet-600 text-white' : 'bg-gray-100'
          } ${revealed ? '' : 'text-xl'}`}
        >
          {revealed ? (
            <span className="text-sm">{message.originalText}</span>
          ) : emoji === null ? (
            <span className="inline-block animate-pulse">✨✨✨</span>
          ) : (
            <span>
              {emoji}
              {fallback && (
                <span
                  title="rough translation"
                  className="ml-1 align-middle text-[10px] opacity-60"
                >
                  🤖💤
                </span>
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
