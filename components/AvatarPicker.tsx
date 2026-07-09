'use client';

import { useState } from 'react';

const AVATARS: { emoji: string; keywords: string }[] = [
  { emoji: '🦖', keywords: 'dinosaur trex rex' },
  { emoji: '🐙', keywords: 'octopus sea tentacle' },
  { emoji: '🦊', keywords: 'fox animal' },
  { emoji: '🐼', keywords: 'panda bear animal' },
  { emoji: '🦄', keywords: 'unicorn magic fantasy' },
  { emoji: '🐸', keywords: 'frog toad animal' },
  { emoji: '🦈', keywords: 'shark ocean fish' },
  { emoji: '🐧', keywords: 'penguin bird animal' },
  { emoji: '🦋', keywords: 'butterfly insect' },
  { emoji: '🐢', keywords: 'turtle slow animal' },
  { emoji: '🦁', keywords: 'lion king animal' },
  { emoji: '🐨', keywords: 'koala bear animal' },
  { emoji: '🐯', keywords: 'tiger cat animal' },
  { emoji: '🦜', keywords: 'parrot bird colorful' },
  { emoji: '🐬', keywords: 'dolphin ocean fish' },
  { emoji: '🦉', keywords: 'owl bird wise night' },
  { emoji: '🍕', keywords: 'pizza food' },
  { emoji: '🌮', keywords: 'taco food mexican' },
  { emoji: '🍩', keywords: 'donut doughnut food sweet' },
  { emoji: '🍉', keywords: 'watermelon fruit food' },
  { emoji: '⚡', keywords: 'lightning bolt energy fast' },
  { emoji: '🌈', keywords: 'rainbow colorful pride' },
  { emoji: '🔥', keywords: 'fire flame hot' },
  { emoji: '⭐', keywords: 'star favorite' },
  { emoji: '🎸', keywords: 'guitar music instrument' },
  { emoji: '🎮', keywords: 'game controller gaming' },
  { emoji: '🚀', keywords: 'rocket space launch' },
  { emoji: '🏀', keywords: 'basketball sports ball' },
  { emoji: '🎨', keywords: 'art palette paint creative' },
  { emoji: '🧠', keywords: 'brain smart mind' },
  { emoji: '👻', keywords: 'ghost spooky halloween' },
  { emoji: '🤖', keywords: 'robot bot ai' },
];

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? AVATARS.filter((a) => a.keywords.toLowerCase().includes(query.trim().toLowerCase()))
    : AVATARS;

  return (
    <div className="flex flex-col gap-2">
      <input
        data-testid="avatar-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        placeholder="Search avatars…"
        aria-label="Search avatars"
        className="rounded-xl border border-gray-300 p-2 text-sm"
      />
      {filtered.length === 0 ? (
        <p className="p-2 text-center text-sm text-gray-400">No avatars match 🤷</p>
      ) : (
        <div className="grid grid-cols-8 gap-2">
          {filtered.map(({ emoji }) => (
            <button
              key={emoji}
              type="button"
              data-testid={`avatar-${emoji}`}
              onClick={() => onChange(emoji)}
              aria-pressed={value === emoji}
              className={`rounded-xl p-2 text-2xl transition hover:scale-110 ${
                value === emoji ? 'bg-violet-200 ring-2 ring-violet-500' : 'bg-gray-100'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
