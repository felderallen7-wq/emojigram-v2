import { join, touchPresence, type RoomEvent } from '@/lib/sse';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Vercel cycles the function at this limit; the client's EventSource
// auto-reconnects and its onopen refetch fills any gap.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id: roomId } = await params;
  const url = new URL(req.url);
  const member = {
    userId: url.searchParams.get('userId') ?? '',
    displayName: url.searchParams.get('displayName') ?? 'Guest',
    avatarEmoji: url.searchParams.get('avatarEmoji') ?? '👤',
  };
  if (!member.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let leave: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let done = false;

  // Single teardown shared by abort, cancel, and enqueue-failure so the
  // sites cannot drift apart again (a missed clearInterval here leaves a
  // ghost heartbeat re-inserting swept presence every 20s).
  function cleanup(closeController: boolean) {
    if (done) return;
    done = true;
    clearInterval(heartbeat);
    req.signal.removeEventListener('abort', onAbort);
    void leave?.().catch(() => {});
    if (closeController) {
      try {
        controllerRef?.close();
      } catch {
        // already closed
      }
    }
  }
  const onAbort = () => cleanup(true);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      const send = (event: RoomEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup(false); // dead client: stream unusable, release everything
        }
      };
      leave = await join(roomId, member, send);
      if (done || req.signal.aborted) {
        // cancel()/abort arrived while join was in flight; cleanup already ran
        // (or never attached anything) without a leave to call — release the
        // just-created subscription directly.
        done = true; // so a later cleanup() (e.g. from cancel()) is a no-op
        void leave().catch(() => {});
        try {
          controllerRef?.close();
        } catch {
          // already closed
        }
        return;
      }
      heartbeat = setInterval(() => {
        void touchPresence(roomId, member.userId).catch(() => {});
      }, 20_000);
      req.signal.addEventListener('abort', onAbort);
    },
    cancel() {
      cleanup(false);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
