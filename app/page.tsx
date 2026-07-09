'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AvatarPicker from '@/components/AvatarPicker';
import { loadIdentity, saveIdentity } from '@/lib/identity';

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🦖');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loadIdentity()) router.replace('/rooms');
  }, [router]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim(), avatarEmoji: avatar }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to join');
      const user = await res.json();
      saveIdentity({ userId: user.id, displayName: user.displayName, avatarEmoji: user.avatarEmoji });
      router.push('/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Emojigram 💬</h1>
        <p className="mt-2 text-gray-500">
          Type anything — it arrives as emoji. Tap a message to reveal what it really said.
        </p>
      </div>
      <form onSubmit={join} className="flex flex-col gap-4">
        <input
          data-testid="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pick a name"
          aria-label="Pick a name"
          maxLength={30}
          className="rounded-xl border border-gray-300 p-3"
        />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <button
          data-testid="join-button"
          type="submit"
          disabled={!name.trim() || busy}
          className="rounded-xl bg-violet-600 p-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Joining…' : `Join as ${avatar}`}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
