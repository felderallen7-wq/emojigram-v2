# Emojigram Vercel Deployment — Design Spec

**Date:** 2026-07-07
**Status:** Approved design, pending implementation plan
**Author:** Allen R. Felder (with Claude)
**Prerequisite:** the MVP on `main` (through commit d71c425)

## Summary

Take Emojigram from a local-only app to a public deployment on Vercel:
GitHub repo → Vercel (Hobby, Fluid compute) → Neon Postgres (data) +
Upstash Redis (realtime + rate limiting) + a spend-capped Anthropic API key.
Local development mirrors production via Docker (Postgres + Redis). The
client, API contracts, translation pipeline, and E2E test survive unchanged.

## Goals

- Live, shareable URL that demos the full app (AI translations included).
- Realtime that works across serverless instances (the in-memory hub
  cannot: each instance has its own memory).
- Dev/test/prod all on Postgres — no provider drift.
- Free tiers everywhere; the only spend is a capped Anthropic key.

## Non-Goals

- Custom domain, analytics, CI pipeline (GitHub Actions), Prisma migration
  files (we stay on the `db push` workflow), multi-region, auth.
- A Redis lock for cross-instance translation coalescing (see Accepted
  Behaviors).

## Decisions Log

- Repo: new public GitHub repository `emojigram` (Allen has GitHub; Vercel
  account created during setup).
- Database: Neon Postgres in production; Docker Postgres locally for dev,
  tests, and E2E. Whole project moves to Postgres (no dual schema).
- Realtime: keep SSE + the existing client; back the hub with Upstash
  Redis pub/sub over the Redis protocol (ioredis), one subscriber per SSE
  connection (Approach A — chosen over the Upstash REST SDK and Neon
  LISTEN/NOTIFY).
- Claude in prod: real `ANTHROPIC_API_KEY`, set on Vercel — a dedicated
  key with a low monthly spend cap (~$5) created in the Anthropic console.
- Schema delivery: `prisma db push` + `prisma db seed` run once from the
  developer machine against Neon; Vercel builds never touch the schema.

## Architecture

### Database (SQLite → Postgres everywhere)

- `prisma/schema.prisma`: provider `sqlite` → `postgresql`. Models are
  unchanged (cuid ids, DateTime, nullable `emojiText`, `@@index` all map).
- `lib/prisma.ts`: swap `@prisma/adapter-better-sqlite3` for
  `@prisma/adapter-pg` (node-postgres Pool). One adapter for Docker
  Postgres and Neon (pooled connection string). Remove `better-sqlite3`
  and its adapter from dependencies.
- New `docker-compose.yml` at repo root: `postgres:17-alpine` with an init
  script creating databases `emojigram` (dev), `emojigram_test` (tests),
  `emojigram_e2e` (Playwright); `redis:7-alpine`.
- `.env.example`:
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/emojigram`,
  `REDIS_URL=redis://localhost:6379`, `ANTHROPIC_API_KEY=""`.
- `vitest.config.ts` env → `emojigram_test` URL; `tests/globalSetup.ts`
  keeps `prisma db push --force-reset` (same consent wiring) against it.
- Playwright webServer env → `emojigram_e2e` URL + local `REDIS_URL` (the
  E2E exercises the Redis hub code path).
- Delete stray `*.db` files; `*.db` stays gitignored.
- Prerequisite documented in README: `docker compose up -d` before
  `npm run dev` / `npm test` / `npm run e2e`.

### Realtime hub (in-memory → Redis, same interface)

- `lib/sse.ts` keeps exporting `join`, `broadcast`, `presenceMembers`,
  `memberCount` and the `RoomEvent`/`BroadcastMessage`/`PresenceMember`
  types, but all four functions become **async** and dispatch to a backend:
  - `lib/hub-memory.ts`: the current implementation, extracted verbatim.
    Used when `REDIS_URL` is unset (unit tests run without Docker).
  - `lib/hub-redis.ts`: used whenever `REDIS_URL` is set (dev, E2E, prod).
- Redis design:
  - `broadcast` → `PUBLISH room:<id> <RoomEvent JSON>`.
  - Each SSE connection creates its own ioredis subscriber connection
    (`new Redis(REDIS_URL)`), subscribed to its room channel; `quit()` on
    abort/cancel. A lazy singleton publisher connection serves all
    publishes and presence reads/writes.
  - Presence per room: hash `presence:<id>` (userId → member JSON) +
    sorted set `presence-hb:<id>` (userId → heartbeat ms). `join` writes
    both and publishes a presence event; the stream route refreshes the
    heartbeat every 20s while connected; `leave` removes and re-publishes.
    All reads sweep entries with heartbeats older than 60s first, so a
    dead instance cannot strand ghost members beyond a minute.
  - Known MVP limitation carries over: presence keyed by userId (two tabs
    = one member).
- `lib/rateLimit.ts`: Redis backend `SET rate:<userId> 1 PX 2000 NX`
  (allowed iff set); in-memory fallback when `REDIS_URL` unset.
- Route edits are limited to awaiting the now-async hub/limiter calls and:
  - `app/api/rooms/[id]/stream/route.ts`: `export const maxDuration = 300`
    and the 20s heartbeat interval (cleared on abort/cancel).
- Client unchanged: when Vercel cycles a stream at the duration limit,
  EventSource auto-reconnects and the existing onopen refetch fills gaps.

### Deployment pipeline

- Push repo to GitHub (`gh repo create emojigram --public`), import into a
  new Vercel Hobby project.
- Vercel Marketplace integrations: Neon (injects `DATABASE_URL`) and
  Upstash Redis (injects `REDIS_URL`; map the injected variable name if it
  differs). `ANTHROPIC_API_KEY` added manually (spend-capped key).
- `package.json` build script: `prisma generate && next build` (Prisma 7
  does not auto-generate on Vercel).
- One-time from the dev machine: `prisma db push` + `prisma db seed`
  against the Neon URL. Later pushes to `main` auto-deploy.
- Browser/account steps (account creation, marketplace clicks, key
  creation) live in a runbook: `docs/DEPLOYMENT.md`. Everything
  scriptable is scripted (`gh`, `vercel` CLI where available).

## Error Handling & Production Behaviors

- Redis unavailable during a request: message POST still persists and
  returns 201 (delivery degrades to reconnect refetch); hub/limiter errors
  surface as the existing `{ error }` JSON where user-visible. The rate
  limiter fails OPEN on Redis errors (availability over strictness for a
  demo app).
- `REDIS_URL` missing in production: logged loudly as a misconfiguration
  (memory hub would be silently wrong across instances); routes still
  function single-instance.
- SSE connection cycling (maxDuration): handled by existing client
  reconnect + refetch. Presence survives via heartbeats; a member's strip
  entry may flicker for at most the sweep window after abrupt death.

## Accepted Behaviors (documented, not fixed)

- Translation in-flight coalescing stays per-instance; cross-instance
  duplicate Claude calls are possible, rare, bounded by the DB
  `emojiText` cache, and cost ~$0.001 each.
- Public demo remains guest-identity, no auth; abuse guards are the
  rate limit + message caps, as in the MVP spec.

## Testing

- All existing unit/API tests run unchanged against memory hub + Docker
  test Postgres (`docker compose up -d` prerequisite).
- New integration test file(s), skipped unless `REDIS_URL` is set: Redis
  hub broadcast reaches a second subscriber; presence heartbeat sweep
  removes stale members; Redis rate limit blocks then expires.
- Playwright E2E unchanged in content but runs against the Redis hub +
  `emojigram_e2e` Postgres.
- Post-deploy smoke checklist in `docs/DEPLOYMENT.md`: two browsers on the
  live URL — join, message → emoji resolves, tap reveals, presence shows
  both, rapid double-send returns 429, reconnect after idle fills gaps.

## Success Criteria

- `npm test`, `npm run build`, `npm run e2e` all green locally with Docker
  services running.
- Live Vercel URL passes the smoke checklist with two concurrent browsers
  on different networks, AI translations working.
- Total recurring cost: $0 base; Anthropic key capped (~$5/month max).
