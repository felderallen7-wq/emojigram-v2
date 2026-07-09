'use client';

import { useState } from 'react';

export default function Composer({
  onSend,
}: {
  onSend: (text: string) => Promise<string | null>; // resolves to an error message or null
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setError('');
    const failure = await onSend(value);
    if (failure) setError(failure);
    else setText('');
  }

  return (
    <form onSubmit={submit} className="border-t border-gray-200 p-3">
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input
          data-testid="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type anything — it arrives as emoji…"
          maxLength={500}
          className="flex-1 rounded-xl border border-gray-300 p-3"
        />
        <button
          data-testid="send-button"
          type="submit"
          disabled={!text.trim()}
          className="rounded-xl bg-violet-600 px-4 font-semibold text-white disabled:opacity-40"
        >
          ➤
        </button>
      </div>
    </form>
  );
}
