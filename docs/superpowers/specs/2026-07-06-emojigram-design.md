# Emojigram — Design Spec

**Date:** 2026-07-06
**Status:** Approved design, pending implementation plan
**Author:** Allen R. Felder (with Claude)

## Summary

Emojigram is a portfolio web app: a real-time chat where every message is
displayed as emoji. Users type normal text, which is sent and stored as-is;
the app translates it to an emoji sequence at display time. Recipients see
emoji only and can tap a message to reveal the sender's original text.

## Goals

- A polished, deployed, shareable demo that shows full-stack skills
  (realtime, API design, LLM integration, responsive UI).
- Zero-friction entry: a visitor is chatting within seconds, no sign-up.
- Messages always send, even when the AI translator is unavailable.

## Non-Goals

- Real accounts, auth, or profiles (guest identity only).
- Private DMs (public rooms only).
- Moderation tooling beyond basic rate limiting and input caps.
- Mobile apps (responsive web only).

## Architecture

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS), Prisma with
SQLite for local dev (Postgres for Vercel deploy), Server-Sent Events for
realtime delivery, Claude API (Haiku 4.5) for translation via a server route.
Deployed to Vercel.

**Message lifecycle (text in, emoji at display time):**

1. User types plain text in the composer and hits send.
2. The text is stored as-is (`originalText`) and broadcast to the room over
   SSE immediately — no translation in the send path.
3. When a message is rendered on any screen (including the sender's), the
   client requests its emoji translation. The bubble shows a brief shimmer
   until the emoji arrives.
4. The first such request runs the translation pipeline (dictionary +
   Claude) and caches the result on the message row (`emojiText`). Every
   later viewer and page reload gets the cached emoji instantly — one
   Claude call per message, triggered by first display instead of by send.
5. Viewers see emoji only; tapping a bubble flips it to reveal the original
   text.

## Screens

1. **Welcome (`/`)** — one-line concept pitch; pick a display name and an
   emoji avatar (curated grid + search). Identity saved to `localStorage`;
   returning visitors skip to rooms.
2. **Room list (`/rooms`)** — seeded public rooms (🍕 Food Talk, 🎬 Movies,
   🎮 Gaming, 💬 Random) with last-message teaser and live member count.
3. **Chat room (`/rooms/[id]`)** —
   - Message list: emoji bubbles with sender name/avatar and timestamp;
     tap/click flips the bubble (card-flip animation) to show original text.
   - Composer: plain text input and send button (no preview step — the
     message goes out as text).
   - Presence strip: avatars of users currently in the room.

**Key components:** `MessageBubble` (shimmer while translating, flip
reveal), `Composer`, `AvatarPicker`, `RoomCard`. All screens
mobile-responsive.

## Data Model (Prisma)

- **User** — `id`, `displayName`, `avatarEmoji`, `createdAt`. Created on
  first visit; id stored in `localStorage`.
- **Room** — `id`, `name`, `emoji`, `description`. Seeded with four rooms.
- **Message** — `id`, `roomId`, `userId`, `originalText`, `emojiText`
  (nullable — filled on first display), `createdAt`.

## API Routes

- `POST /api/users` — create guest identity.
- `GET /api/rooms` — room list with latest message.
- `GET /api/rooms/[id]/messages` — last 50 messages.
- `POST /api/rooms/[id]/messages` — accepts original text, stores it, and
  broadcasts over SSE immediately (no translation in the send path).
- `GET /api/messages/[id]/emoji` — returns the message's `emojiText`,
  running the translation pipeline and caching the result on first request.
- `GET /api/rooms/[id]/stream` — SSE endpoint: new messages, presence
  join/leave events.

## Translation Pipeline (server-side, run at first display)

1. Tokenize message; map words through a ~500-entry word→emoji dictionary
   (`pizza→🍕`, `love→❤️`, `tonight→🌙`, ...).
2. Send sentence plus dictionary hits to Claude Haiku 4.5 with a tight
   prompt: return only an emoji sequence conveying the message.
3. Validate response is emoji-only (strip anything else).
4. On API failure or 5s timeout, fall back to dictionary-only output — the
   message still displays. Fallback results carry a subtle
   "🤖💤 rough translation" hint and are NOT cached, so a later view can
   retry the full translation.
5. Successful translations are cached on the message row (`emojiText`);
   identical normalized texts also share a translation cache to save API
   calls.

Messages that are already pure emoji pass through untranslated. Mixed
text+emoji input keeps the user's emojis and translates the words around
them.

## Error Handling & Abuse Guards

- **SSE drop:** auto-reconnect with backoff; on reconnect, fetch messages
  since last-seen id so no messages are missed.
- **Untranslatable input:** Claude instructed to always produce something;
  ultimate fallback is 🤷. Empty/whitespace messages blocked client- and
  server-side.
- **Limits:** 500 chars max per message; per-user rate limit of 1 message
  per 2 seconds; original text HTML-escaped on render.

## Testing

- **Unit (Vitest):** dictionary tokenizer/mapper, emoji-only validator,
  Claude-response sanitizer, rate limiter.
- **API:** message POST stores text and broadcasts; emoji endpoint
  translates on first call and returns the cache on later calls; fallback
  path with Claude mocked to fail (result not cached).
- **E2E (Playwright, one smoke test):** two browser contexts join a room;
  one sends "pizza tonight?" as text, the other sees the bubble resolve to
  emoji live and taps to reveal the original text.

## Decisions Log

- Enforcement model: auto-translate typed text to emoji (not picker-only).
- Message flow: text is sent and stored as-is; emoji translation happens at
  display time (translate-once-and-cache), not in the send path. Composer
  preview dropped.
- Reveal model: tap to reveal original text (original is stored).
- Chat model: public rooms only.
- Identity: guest name + emoji avatar in localStorage, no auth.
- Architecture: Next.js + SSE on Vercel (matches TaskFlow patterns), over
  Socket.IO server or Supabase realtime.
- Translation: hybrid dictionary + Claude Haiku, with dictionary-only
  fallback.
