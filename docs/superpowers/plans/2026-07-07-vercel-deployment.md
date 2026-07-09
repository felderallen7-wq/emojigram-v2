# Emojigram Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Emojigram to Vercel — Postgres everywhere (Neon in prod, Docker locally), Redis-backed SSE realtime (Upstash in prod, Docker locally), spend-capped Claude key, public GitHub repo.

**Architecture:** Swap the Prisma driver adapter to `pg` and the schema provider to `postgresql` (models unchanged). Keep `lib/sse.ts`'s interface but make it async and dispatch to two backends: the existing in-memory hub (extracted, used when `REDIS_URL` is unset) and a new Redis hub (pub/sub broadcasts, heartbeat-swept presence). Rate limiting moves to Redis with the same fallback. Client code is untouched.

**Tech Stack:** Existing app (Next.js 16, Prisma 7, Vitest, Playwright) + `@prisma/adapter-pg`/`pg`, `ioredis`, Docker Compose (postgres:17-alpine, redis:7-alpine), Neon, Upstash Redis, Vercel Hobby.

**Spec:** `docs/superpowers/specs/2026-07-07-vercel-deployment-design.md` — this plan implements it exactly.

## Global Constraints

- Working directory for every command: the `emojigram/` repo root. Branch: create `feature/vercel-deployment` from `main` before Task 1.
- Docker services must be running for dev/tests/E2E from Task 1 onward: `docker compose up -d`. If Docker Desktop is not running, start it (or report BLOCKED).
- Database URLs (exact):
  - dev `postgresql://postgres:postgres@localhost:5432/emojigram`
  - tests `postgresql://postgres:postgres@localhost:5432/emojigram_test`
  - E2E `postgresql://postgres:postgres@localhost:5432/emojigram_e2e`
- Local Redis URL: `redis://localhost:6379`.
- The `lib/sse.ts` public interface after this plan: async `join`, `broadcast`, `presenceMembers`, `memberCount`, plus new async `touchPresence(roomId, userId)`; types `RoomEvent`, `BroadcastMessage`, `PresenceMember` re-exported so existing `@/lib/sse` type imports keep working.
- Unit tests must pass WITHOUT Redis (memory hub — vitest env sets `REDIS_URL: ''`); they DO require the Docker Postgres test database.
- Presence heartbeat: refreshed every 20s by the stream route; entries with heartbeats older than 60s are swept on every presence read.
- Rate limiter fails OPEN on Redis errors.
- The client (`hooks/`, `components/`, `app/page.tsx`, `app/rooms/page.tsx`, `app/rooms/[id]/page.tsx` client logic) must NOT change, except zero lines — if a task seems to require client edits, stop and report BLOCKED.
- `tests/globalSetup.ts` keeps the scoped `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` wiring (it now resets the Postgres test database).
- All API error responses keep the `{ "error": string }` shape.
- Commit after every task; append the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Docker services + env plumbing

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/init-dbs.sql`
- Modify: `.env`, `.env.example`
- Modify: `README.md` (Run it section)

**Interfaces:**
- Consumes: nothing.
- Produces: local Postgres with databases `emojigram`, `emojigram_test`, `emojigram_e2e` on :5432 and Redis on :6379; env files pointing at them.

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-dbs.sql:/docker-entrypoint-initdb.d/init-dbs.sql
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

- [ ] **Step 2: Create docker/init-dbs.sql**

```sql
CREATE DATABASE emojigram;
CREATE DATABASE emojigram_test;
CREATE DATABASE emojigram_e2e;
```

- [ ] **Step 3: Start services and verify**

Run: `docker compose up -d` then `docker compose ps`
Expected: postgres and redis both "running". Then verify the databases exist:
`docker compose exec postgres psql -U postgres -c "\l"` — all three emojigram databases listed. (If the volume pre-existed from an earlier attempt, `docker compose down -v && docker compose up -d` to re-run init.)

- [ ] **Step 4: Update .env and .env.example**

`.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/emojigram"
REDIS_URL="redis://localhost:6379"
ANTHROPIC_API_KEY=""
```

`.env.example` (keep the ANTHROPIC_API_KEY comment about optional AI translations; fix the old "relative to prisma/" comment):

```bash
# Local services: docker compose up -d
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/emojigram"
REDIS_URL="redis://localhost:6379"
# Optional - without it, emoji translation falls back to the built-in dictionary
ANTHROPIC_API_KEY=""
```

- [ ] **Step 5: Update README "Run it"**

Replace the run steps with:

```markdown
## Run it

Requires Node 20.19+ and Docker.

    cp .env.example .env   # Windows: copy .env.example .env
    docker compose up -d   # Postgres + Redis
    npm install
    npx prisma db push && npx prisma db seed
    npm run dev
```

(Keep the rest of the README intact for now; Task 8 revises the deployment-related parts.)

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker/init-dbs.sql .env.example README.md
git commit -m "chore: add Docker Postgres+Redis services and env plumbing"
```

(Note: `.env` is gitignored — changed locally, not committed.)

---

### Task 2: Prisma to Postgres

**Files:**
- Modify: `prisma/schema.prisma`, `lib/prisma.ts`, `vitest.config.ts`, `package.json` (deps)
- Delete: stray `dev.db` / `test.db` / `e2e.db` files if present (they are untracked)

**Interfaces:**
- Consumes: Task 1's databases.
- Produces: `import { prisma } from '@/lib/prisma'` unchanged for all callers, now backed by Postgres via `@prisma/adapter-pg`.

- [ ] **Step 1: Swap dependencies**

```bash
npm install @prisma/adapter-pg pg
npm install --save-dev @types/pg
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3
```

- [ ] **Step 2: Update prisma/schema.prisma datasource**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

(Models unchanged. If `prisma.config.ts` declares anything sqlite-specific, adapt minimally; the `env('DATABASE_URL')` read stays.)

- [ ] **Step 3: Update lib/prisma.ts**

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

(If the installed `@prisma/adapter-pg` version's constructor takes a `pg.Pool` instead of a config object, adapt to `new PrismaPg(new Pool({ connectionString: ... }))` and record the deviation.)

- [ ] **Step 4: Point Vitest at the test database**

In `vitest.config.ts` `test.env`, set `DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/emojigram_test'` (keep `ANTHROPIC_API_KEY: ''`; also add `REDIS_URL: ''` — Task 3 depends on it).

- [ ] **Step 5: Push schema, seed dev, verify suite**

```bash
npx prisma generate
npx prisma db push
npx prisma db seed
npm test
```

Expected: push + seed clean against dev DB; all 50 tests pass (globalSetup force-resets `emojigram_test`; the consent env wiring already in globalSetup covers the AI-agent guard). Delete stray `*.db` files.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: move Prisma to Postgres via pg adapter"
```

---

### Task 3: Async hub interface + memory backend extraction

**Files:**
- Create: `lib/hub-types.ts`, `lib/hub-memory.ts`
- Modify: `lib/sse.ts` (becomes types re-export + async dispatcher), `app/api/rooms/route.ts`, `app/api/rooms/[id]/messages/route.ts`, `app/api/rooms/[id]/stream/route.ts`, `tests/sse.test.ts`
- Test: `tests/sse.test.ts` (updated for async)

**Interfaces:**
- Consumes: current `lib/sse.ts` implementation.
- Produces (all from `@/lib/sse`): types `PresenceMember`, `BroadcastMessage`, `RoomEvent` (unchanged shapes); `join(roomId, member, subscriber): Promise<() => Promise<void>>`; `broadcast(roomId, event): Promise<void>`; `presenceMembers(roomId): Promise<PresenceMember[]>`; `memberCount(roomId): Promise<number>`; `touchPresence(roomId, userId): Promise<void>` (no-op in memory backend).

- [ ] **Step 1: Create lib/hub-types.ts** — move the three type definitions (`PresenceMember`, `BroadcastMessage`, `RoomEvent`) verbatim from `lib/sse.ts`, plus:

```ts
export type Subscriber = (event: RoomEvent) => void;
export type Leave = () => Promise<void>;
```

- [ ] **Step 2: Create lib/hub-memory.ts** — the current `lib/sse.ts` implementation, adapted to async signatures:

```ts
import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  // Presence keyed by userId: same user in two tabs counts once and leaves
  // when either tab closes. Acceptable for the MVP.
  presence: Map<string, Map<string, PresenceMember>>;
};

const globalStore = globalThis as unknown as { __emojigramHub?: Hub };
const hub = (globalStore.__emojigramHub ??= {
  subscribers: new Map(),
  presence: new Map(),
});

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  for (const subscriber of hub.subscribers.get(roomId) ?? []) {
    try {
      subscriber(event);
    } catch {
      // Dead client mid-write; its unsubscribe cleans up on disconnect.
    }
  }
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  return [...(hub.presence.get(roomId)?.values() ?? [])];
}

export async function memberCount(roomId: string): Promise<number> {
  return hub.presence.get(roomId)?.size ?? 0;
}

export async function touchPresence(_roomId: string, _userId: string): Promise<void> {
  // In-memory presence has no heartbeats; entries live exactly as long as
  // their subscription.
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  let subs = hub.subscribers.get(roomId);
  if (!subs) hub.subscribers.set(roomId, (subs = new Set()));
  subs.add(subscriber);

  let members = hub.presence.get(roomId);
  if (!members) hub.presence.set(roomId, (members = new Map()));
  members.set(member.userId, member);
  await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });

  return async () => {
    subs.delete(subscriber);
    hub.presence.get(roomId)?.delete(member.userId);
    await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });
  };
}
```

- [ ] **Step 3: Rewrite lib/sse.ts as the dispatcher** (Task 4 adds the Redis import; for now memory-only):

```ts
import * as memory from './hub-memory';
import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

export type { BroadcastMessage, Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

// Task 4 replaces this with a REDIS_URL-based choice between backends.
function backend() {
  return memory;
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  return backend().join(roomId, member, subscriber);
}

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  return backend().broadcast(roomId, event);
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  return backend().presenceMembers(roomId);
}

export async function memberCount(roomId: string): Promise<number> {
  return backend().memberCount(roomId);
}

export async function touchPresence(roomId: string, userId: string): Promise<void> {
  return backend().touchPresence(roomId, userId);
}
```

- [ ] **Step 4: Update the three routes to await**

- `app/api/rooms/route.ts`: `memberCount: memberCount(room.id)` is inside a sync `.map` — restructure with `Promise.all`:

```ts
export async function GET() {
  const rooms = await prisma.room.findMany({
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const withCounts = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      name: room.name,
      emoji: room.emoji,
      description: room.description,
      latestMessage: room.messages[0]
        ? { emojiText: room.messages[0].emojiText, createdAt: room.messages[0].createdAt }
        : null,
      memberCount: await memberCount(room.id),
    })),
  );
  return NextResponse.json(withCounts);
}
```

- `app/api/rooms/[id]/messages/route.ts`: `broadcast(...)` → `await broadcast(...)`.
- `app/api/rooms/[id]/stream/route.ts`: `start` becomes async; join is awaited; guard the abort-before-join race:

```ts
const encoder = new TextEncoder();
let leave: (() => Promise<void>) | undefined;

const stream = new ReadableStream({
  async start(controller) {
    const send = (event: RoomEvent) => {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        void leave?.();
      }
    };
    leave = await join(roomId, member, send);
    if (req.signal.aborted) {
      await leave();
      try {
        controller.close();
      } catch {
        // already closed
      }
      return;
    }
    req.signal.addEventListener('abort', () => {
      void leave?.();
      try {
        controller.close();
      } catch {
        // already closed
      }
    });
  },
  cancel() {
    void leave?.();
  },
});
```

(Task 6 adds the heartbeat interval and `maxDuration` to this same route.)

- [ ] **Step 5: Update tests/sse.test.ts for the async interface** — same five test cases, with `await` on `join`/`broadcast`/`presenceMembers`/`memberCount` and leave calls (`await leave()`); test functions become `async`. Semantics asserted are identical.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass (memory backend; `REDIS_URL: ''` in vitest env), types clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib app/api tests/sse.test.ts
git commit -m "refactor: async hub interface with extracted memory backend"
```

---

### Task 4: Redis hub backend

**Files:**
- Create: `lib/hub-redis.ts`
- Modify: `lib/sse.ts` (dispatcher chooses by `REDIS_URL`), `package.json` (ioredis)

**Interfaces:**
- Consumes: `hub-types` (Task 3); `REDIS_URL` env.
- Produces: same five async functions as `hub-memory`, Redis-backed. Redis keys/channels: `room:<id>` (pub/sub channel), `presence:<id>` (hash userId → member JSON), `presence-hb:<id>` (zset userId → heartbeat ms).

- [ ] **Step 1: Install ioredis**

```bash
npm install ioredis
```

- [ ] **Step 2: Create lib/hub-redis.ts**

```ts
import Redis from 'ioredis';
import type { Leave, PresenceMember, RoomEvent, Subscriber } from './hub-types';

// Presence entries whose heartbeat is older than this are swept on read, so
// a dead serverless instance cannot strand ghost members for long.
const HEARTBEAT_STALE_MS = 60_000;

const globalStore = globalThis as unknown as { __emojigramRedisPub?: Redis };

function pub(): Redis {
  return (globalStore.__emojigramRedisPub ??= new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 2,
  }));
}

const channel = (roomId: string) => `room:${roomId}`;
const presenceKey = (roomId: string) => `presence:${roomId}`;
const heartbeatKey = (roomId: string) => `presence-hb:${roomId}`;

async function sweepStale(roomId: string): Promise<void> {
  const cutoff = Date.now() - HEARTBEAT_STALE_MS;
  const stale = await pub().zrangebyscore(heartbeatKey(roomId), '-inf', cutoff);
  if (stale.length > 0) {
    await pub().hdel(presenceKey(roomId), ...stale);
    await pub().zrem(heartbeatKey(roomId), ...stale);
  }
}

export async function broadcast(roomId: string, event: RoomEvent): Promise<void> {
  await pub().publish(channel(roomId), JSON.stringify(event));
}

export async function presenceMembers(roomId: string): Promise<PresenceMember[]> {
  await sweepStale(roomId);
  const raw = await pub().hvals(presenceKey(roomId));
  return raw.map((value) => JSON.parse(value) as PresenceMember);
}

export async function memberCount(roomId: string): Promise<number> {
  await sweepStale(roomId);
  return pub().hlen(presenceKey(roomId));
}

export async function touchPresence(roomId: string, userId: string): Promise<void> {
  await pub().zadd(heartbeatKey(roomId), Date.now(), userId);
}

export async function join(
  roomId: string,
  member: PresenceMember,
  subscriber: Subscriber,
): Promise<Leave> {
  // One subscriber connection per SSE stream; quit on leave.
  const sub = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2 });
  await sub.subscribe(channel(roomId));
  sub.on('message', (_channel, message) => {
    try {
      subscriber(JSON.parse(message) as RoomEvent);
    } catch {
      // Dead client mid-write; leave() cleans up on disconnect.
    }
  });

  await pub().hset(presenceKey(roomId), member.userId, JSON.stringify(member));
  await touchPresence(roomId, member.userId);
  await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });

  return async () => {
    sub.disconnect();
    await pub().hdel(presenceKey(roomId), member.userId);
    await pub().zrem(heartbeatKey(roomId), member.userId);
    await broadcast(roomId, { type: 'presence', members: await presenceMembers(roomId) });
  };
}
```

- [ ] **Step 3: Update the dispatcher in lib/sse.ts**

```ts
import * as memory from './hub-memory';
import * as redis from './hub-redis';

function backend() {
  return process.env.REDIS_URL ? redis : memory;
}
```

(Rest of the file unchanged. `hub-redis` connects lazily inside its functions, so importing it with no `REDIS_URL` — as unit tests do — never opens a connection.)

- [ ] **Step 4: Verify (memory path untouched)**

Run: `npm test && npx tsc --noEmit`
Expected: all tests still pass (vitest env `REDIS_URL: ''` → memory backend), types clean.

- [ ] **Step 5: Manual Redis smoke**

With Docker up, run `npm run dev` (`.env` has `REDIS_URL`), open two browser windows into a room, send a message: it must appear in both; `docker compose exec redis redis-cli keys '*'` shows `presence:*` keys while connected. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add lib/hub-redis.ts lib/sse.ts package.json package-lock.json
git commit -m "feat: add Redis pub/sub hub backend with heartbeat presence"
```

---

### Task 5: Redis-backed rate limiter

**Files:**
- Modify: `lib/rateLimit.ts`, `app/api/rooms/[id]/messages/route.ts` (await), `tests/rateLimit.test.ts` (await)

**Interfaces:**
- Consumes: `REDIS_URL`; the shared publisher connection pattern (import `pub` — export it from `hub-redis` as `redisConnection()` or duplicate the lazy singleton locally; keep it simple: a local lazy singleton in rateLimit.ts is fine).
- Produces: `checkRateLimit(userId: string, now?: number): Promise<boolean>`, `resetRateLimits(): void` (memory path only, unchanged semantics for tests).

- [ ] **Step 1: Rewrite lib/rateLimit.ts**

```ts
import Redis from 'ioredis';

const WINDOW_MS = 2_000;

const globalStore = globalThis as unknown as {
  __rateLimits?: Map<string, number>;
  __rateLimitRedis?: Redis;
};
const lastAllowed = (globalStore.__rateLimits ??= new Map<string, number>());

function redis(): Redis {
  return (globalStore.__rateLimitRedis ??= new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 2,
  }));
}

export async function checkRateLimit(userId: string, now: number = Date.now()): Promise<boolean> {
  if (process.env.REDIS_URL) {
    try {
      // Allowed iff the key did not exist; it self-expires after the window.
      const result = await redis().set(`rate:${userId}`, '1', 'PX', WINDOW_MS, 'NX');
      return result === 'OK';
    } catch {
      return true; // fail open: availability over strictness for a demo app
    }
  }
  const last = lastAllowed.get(userId);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  lastAllowed.set(userId, now);
  return true;
}

export function resetRateLimits(): void {
  lastAllowed.clear();
}
```

- [ ] **Step 2: Await it in the messages route** — `if (!checkRateLimit(userId))` → `if (!(await checkRateLimit(userId)))`.

- [ ] **Step 3: Update tests/rateLimit.test.ts** — same five cases, `await checkRateLimit(...)`; async test functions. (They exercise the memory path — `REDIS_URL` is `''` in the vitest env.)

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add lib/rateLimit.ts app/api/rooms tests/rateLimit.test.ts
git commit -m "feat: Redis-backed cross-instance rate limiting"
```

---

### Task 6: Stream route — maxDuration + presence heartbeat

**Files:**
- Modify: `app/api/rooms/[id]/stream/route.ts`

**Interfaces:**
- Consumes: `touchPresence` from `@/lib/sse` (Tasks 3-4).
- Produces: the stream route declares `export const maxDuration = 300;` and refreshes the member's heartbeat every 20s while connected.

- [ ] **Step 1: Add maxDuration** — next to `export const dynamic = 'force-dynamic';`:

```ts
// Vercel cycles the function at this limit; the client's EventSource
// auto-reconnects and its onopen refetch fills any gap.
export const maxDuration = 300;
```

- [ ] **Step 2: Add the heartbeat interval** — in `start`, after the abort-race guard from Task 3:

```ts
const heartbeat = setInterval(() => {
  void touchPresence(roomId, member.userId);
}, 20_000);
req.signal.addEventListener('abort', () => {
  clearInterval(heartbeat);
  void leave?.();
  try {
    controller.close();
  } catch {
    // already closed
  }
});
```

(Replace the existing abort listener; also `clearInterval` in `cancel()` — hoist `heartbeat` with `let heartbeat: ReturnType<typeof setInterval> | undefined;` above the stream if needed.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: green. Manual check as in Task 4 Step 5 still works.

- [ ] **Step 4: Commit**

```bash
git add app/api/rooms
git commit -m "feat: stream heartbeats and Vercel maxDuration"
```

---

### Task 7: Redis integration tests + E2E on the Redis path

**Files:**
- Create: `tests/redis-hub.integration.test.ts`
- Modify: `package.json` (script), `playwright.config.ts` (webServer env)

**Interfaces:**
- Consumes: `lib/hub-redis.ts`, `lib/rateLimit.ts`, local Docker Redis.
- Produces: `npm run test:redis` (integration tests, require Docker); E2E runs against Redis hub + `emojigram_e2e` Postgres.

- [ ] **Step 1: Write tests/redis-hub.integration.test.ts**

The suite self-skips without `REDIS_TEST_URL`. It sets `process.env.REDIS_URL` BEFORE exercising the lazily-connecting hub functions:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REDIS_TEST_URL = process.env.REDIS_TEST_URL;

describe.skipIf(!REDIS_TEST_URL)('redis hub (integration)', () => {
  let hub: typeof import('@/lib/hub-redis');
  let rateLimit: typeof import('@/lib/rateLimit');

  beforeAll(async () => {
    process.env.REDIS_URL = REDIS_TEST_URL;
    hub = await import('@/lib/hub-redis');
    rateLimit = await import('@/lib/rateLimit');
  });

  afterAll(async () => {
    // Leave connections to process exit; keys used below are self-cleaning
    // (leave() removes presence; rate keys expire).
  });

  const member = (id: string) => ({ userId: id, displayName: id, avatarEmoji: '🦖' });

  it('broadcasts across two independent subscribers', async () => {
    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    const leaveA = await hub.join('itest-room', member('a'), (e) => gotA.push(e));
    const leaveB = await hub.join('itest-room', member('b'), (e) => gotB.push(e));

    await hub.broadcast('itest-room', { type: 'presence', members: [] });
    await new Promise((resolve) => setTimeout(resolve, 300)); // pub/sub delivery

    expect(gotA.length).toBeGreaterThan(0);
    expect(gotB.length).toBeGreaterThan(0);
    await leaveA();
    await leaveB();
  });

  it('tracks presence and sweeps stale heartbeats', async () => {
    const leave = await hub.join('itest-sweep', member('sweeper'), () => {});
    expect(await hub.memberCount('itest-sweep')).toBe(1);

    // Backdate the heartbeat past the 60s staleness window, then read.
    const Redis = (await import('ioredis')).default;
    const raw = new Redis(REDIS_TEST_URL!);
    await raw.zadd('presence-hb:itest-sweep', Date.now() - 120_000, 'sweeper');
    expect(await hub.memberCount('itest-sweep')).toBe(0);
    raw.disconnect();
    await leave();
  });

  it('rate limits across calls and expires', async () => {
    const id = `itest-rl-${Math.floor(Date.now() / 1000)}`;
    expect(await rateLimit.checkRateLimit(id)).toBe(true);
    expect(await rateLimit.checkRateLimit(id)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(await rateLimit.checkRateLimit(id)).toBe(true);
  }, 10_000);
});
```

- [ ] **Step 2: Add the script** — `package.json`:

```json
"test:redis": "cross-env REDIS_TEST_URL=redis://localhost:6379 vitest run tests/redis-hub.integration.test.ts"
```

```bash
npm install --save-dev cross-env
```

- [ ] **Step 3: Run it**

Run: `npm run test:redis` (Docker up)
Expected: 3 passed. Also `npm test` still passes and SKIPS this file's cases (no `REDIS_TEST_URL`).

- [ ] **Step 4: Point the E2E at the Redis path** — `playwright.config.ts` webServer env becomes:

```ts
env: {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/emojigram_e2e',
  REDIS_URL: 'redis://localhost:6379',
  ANTHROPIC_API_KEY: '',
},
```

- [ ] **Step 5: Run the E2E**

Run: `npm run e2e` (Docker up, port 3000 free)
Expected: 1 passed — now exercising the production hub code path.

- [ ] **Step 6: Commit**

```bash
git add tests/redis-hub.integration.test.ts package.json package-lock.json playwright.config.ts
git commit -m "test: Redis hub integration tests and Redis-path E2E"
```

---

### Task 8: Build script, README, and deployment runbook

**Files:**
- Modify: `package.json` (build script), `README.md`
- Create: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: everything above.
- Produces: Vercel-ready build; a runbook a human can follow for the browser-only steps.

- [ ] **Step 1: Build script** — `package.json`: `"build": "prisma generate && next build"` (Prisma 7 does not generate on Vercel installs by itself). Verify locally: `npm run build` succeeds.

- [ ] **Step 2: README updates** — Stack line mentions Postgres (Neon) + Redis (Upstash) + Vercel; tests section notes `docker compose up -d` prerequisite and the new `npm run test:redis`; add a "Deployment" section linking to `docs/DEPLOYMENT.md` and the live URL placeholder to fill after first deploy.

- [ ] **Step 3: Write docs/DEPLOYMENT.md** — the runbook, with each step labeled **[you]** (browser/account) or **[automated]** (CLI). Content requirements (write actual steps, not placeholders):

1. **[you]** Create the Vercel account: vercel.com → "Continue with GitHub" (uses your GitHub identity; no separate email signup).
2. **[automated]** Push the repo: `gh auth status` (login if needed: `gh auth login`), then `gh repo create emojigram --public --source . --push`.
3. **[you]** Vercel dashboard → Add New Project → Import `emojigram`. Framework preset: Next.js (auto). Do NOT deploy yet (env vars first).
4. **[you]** Project → Storage/Integrations: add **Neon** (Marketplace) — accept defaults; confirm `DATABASE_URL` appears in the project env (use the pooled connection string variant if offered). Add **Upstash Redis** (Marketplace); confirm a `rediss://` connection URL is exposed as `REDIS_URL` — if the integration injects it under another name (e.g. `KV_URL` / `UPSTASH_REDIS_URL`), add `REDIS_URL` manually with the same value.
5. **[you]** Anthropic console (platform.claude.com) → create a NEW API key named `emojigram-prod`, set a monthly spend limit (~$5). Add it as `ANTHROPIC_API_KEY` in Vercel project env (Production).
6. **[automated, one-time]** Schema + seed to Neon from this machine: temporarily set `DATABASE_URL` to the Neon pooled URL in the shell, run `npx prisma db push && npx prisma db seed`, then unset it. (Never commit the Neon URL.)
7. **[you]** Vercel → Deploy. Subsequent pushes to `main` auto-deploy.
8. **Smoke checklist** (two browsers, ideally one on your phone off-wifi): join both → same room → send "pizza tonight?" → emoji resolves in BOTH (AI, no 🤖💤 marker) → tap reveals text → presence shows both avatars → send two messages within 2s → second gets the slow-down error → leave one browser idle 6+ minutes, send from the other, idle one catches up on its own (reconnect refetch).
9. **Troubleshooting**: build fails on prisma → check build script includes `prisma generate`; realtime dead in prod but send works → check `REDIS_URL` env name mapping; translations always 🤖💤 → key missing/exhausted spend cap.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md docs/DEPLOYMENT.md
git commit -m "docs: Vercel build script and deployment runbook"
```

---

### Task 9: Merge, publish, provision, deploy, verify

This task is interactive — it pauses for the user's browser steps from the runbook. No new code.

- [ ] **Step 1: Merge the branch** — full local gate first: `npm run lint && npx tsc --noEmit && npm test && npm run test:redis && npm run build && npm run e2e` all green; then merge `feature/vercel-deployment` into `main` (re-run `npm test` on the result), delete the branch.
- [ ] **Step 2: Runbook step 2** — push to GitHub (`gh repo create emojigram --public --source . --push`). If `gh` is not authenticated, hand the user runbook step 2 and wait.
- [ ] **Step 3: Hand the user runbook steps 1, 3, 4, 5** (Vercel account, import, integrations, API key) and wait for confirmation that env vars exist.
- [ ] **Step 4: Runbook step 6** — push schema + seed to Neon (the user pastes the Neon pooled URL into the session or sets it in the shell; never written to a file).
- [ ] **Step 5: First deploy (runbook step 7)** — user clicks Deploy; on completion, run the smoke checklist (step 8) together against the live URL. Record the URL in README and commit.
- [ ] **Step 6: Final commit + wrap-up** — README live-URL commit pushed to `main` (auto-deploys); report results.

---

## Plan Self-Review Notes

- **Spec coverage:** Docker + env (Task 1), Postgres everywhere (Task 2), async hub + memory extraction (Task 3), Redis hub w/ pub-sub + heartbeat presence (Task 4), Redis rate limit fail-open (Task 5), maxDuration + heartbeat (Task 6), Redis integration tests + Redis-path E2E (Task 7), build script + runbook + README (Task 8), publish/provision/deploy/smoke (Task 9). Client untouched throughout (constraint enforced per-task). Accepted behaviors (per-instance translate coalescing; guest identity) documented in the spec, not re-litigated here.
- **Interface consistency:** the five hub functions + types are defined once in Task 3's Interfaces block and reused verbatim in Tasks 4-7; rate limiter's async signature (Task 5) matches its single call site edit; `touchPresence` consumed only by Task 6.
- **Placeholder scan:** clean — every code step carries the actual code; the runbook step lists concrete actions and exact commands.
- **Risk notes for implementers:** `@prisma/adapter-pg` constructor shape may vary by minor version (Task 2 Step 3 carries the adaptation note); Upstash env-var naming varies (runbook step 4 handles the mapping); ioredis `zrangebyscore` argument form is `(key, min, max)` with `'-inf'` string — as written.

