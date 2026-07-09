# Emojigram 💬

Chat where every message arrives as emoji. Type anything — it's sent and stored
as text, translated to an emoji sequence the first time anyone sees it
(built-in dictionary + Claude Haiku), and cached. Tap a bubble to reveal the
original text.

## Stack

Next.js 16 · TypeScript · Tailwind · Prisma + Postgres (Neon in production,
Docker locally) · Redis realtime hub (Upstash in production, Docker locally) ·
Server-Sent Events · Claude API (claude-haiku-4-5) · Vitest · Playwright ·
Vercel

## Run it

Requires Node 20.19+ and Docker.

    cp .env.example .env   # Windows: copy .env.example .env
    docker compose up -d   # Postgres + Redis
    npm install
    npx prisma db push && npx prisma db seed
    npm run dev

Open http://localhost:3000 in two windows and start chatting.

Setting `ANTHROPIC_API_KEY` inside `.env` is optional: with it set,
translations use Claude; without it, the built-in word→emoji dictionary is
used (messages get a 🤖💤 "rough translation" marker).

## Tests

`docker compose up -d` must be running first — the unit/API tests use the
`emojigram_test` Postgres database, the Redis-gated integration tests and
Playwright both use the local Redis container.

    npm test           # unit + API tests (Vitest)
    npm run test:redis # Redis hub integration tests (needs the Redis container)
    npm run e2e        # two-browser live chat smoke test (Playwright)

Before running `npm run e2e` locally, make sure nothing else is running on
port 3000 — a reused dev server would skip the E2E's seeded, key-less
environment.

## Deployment

Runbook for deploying to Vercel (GitHub → Vercel → Neon + Upstash Redis +
Anthropic API key): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Live at: _(URL added after first deploy)_

## Design docs

- Spec: docs/superpowers/specs/2026-07-06-emojigram-design.md
- Plan: docs/superpowers/plans/2026-07-06-emojigram.md
