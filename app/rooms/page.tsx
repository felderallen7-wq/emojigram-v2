'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RoomCard, { type RoomSummary } from '@/components/RoomCard';
import { loadIdentity } from '@/lib/identity';

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);

  useEffect(() => {
    if (!loadIdentity()) {
      router.replace('/');
      return;
    }
    fetch('/api/rooms')
      .then((res) => {
        if (!res.ok) throw new Error('rooms');
        return res.json();
      })
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Pick a room 🚪</h1>
      {rooms === null && <p className="text-gray-400">Loading…</p>}
      {rooms?.map((room) => <RoomCard key={room.id} room={room} />)}
    </main>
  );
}
