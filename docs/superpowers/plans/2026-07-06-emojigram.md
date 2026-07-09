# Emojigram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Emojigram — a real-time public-room chat where messages are typed and stored as plain text but displayed as emoji (translated at first display via dictionary + Claude Haiku, cached per message, tap-to-reveal original).

**Architecture:** Next.js 15 App Router with API routes for everything server-side. Messages POST as text and broadcast instantly over Server-Sent Events (in-memory hub); a separate emoji endpoint translates on first request and caches the result on the message row. Prisma + SQLite stores users/rooms/messages. Guest identity lives in localStorage.

**Tech Stack:** Next.js 15 (TypeScript, Tailwind CSS 4, App Router, no src dir), Prisma 6 + SQLite, `@anthropic-ai/sdk` (model `claude-haiku-4-5`), Vitest + vite-tsconfig-paths (unit/API tests), Playwright (one E2E smoke test).

**Spec:** `docs/superpowers/specs/2026-07-06-emojigram-design.md` — the plan implements it exactly.

## Global Constraints

- Node.js >= 20.19 (the emoji code uses the RegExp `v` flag / `\p{RGI_Emoji}`, available in Node 20+).
- Working directory for every command: the `emojigram/` repo root (this repo).
- Claude model string is exactly `claude-haiku-4-5` (alias, no date suffix). Client is created lazily so a missing `ANTHROPIC_API_KEY` never crashes at import; without a key the app must still work via dictionary fallback.
- Claude call: 5s timeout, 1 retry, ~200 max_tokens.
- Message limit: 500 chars. Rate limit: 1 message per 2 seconds per user.
- All API error responses use the JSON shape `{ "error": "<human message>" }` with an appropriate HTTP status.
- Databases: dev `file:./dev.db`, tests `file:./test.db` (paths relative to `prisma/`, per Prisma SQLite convention). Vitest sets `DATABASE_URL=file:./test.db` and `ANTHROPIC_API_KEY=''` (empty → dictionary fallback in tests).
- Room ids are human slugs: `food`, `movies`, `gaming`, `random`.
- Failed (fallback) translations are NEVER written to `Message.emojiText`; successful Claude translations always are.
- Commit after every task with the message given in its final step. The repo already exists with git configured (user: Allen R. Felder).

---

### Task 1: Scaffold Next.js project + Vitest

**Files:**
- Create: entire Next.js scaffold at repo root (`app/`, `package.json`, `tsconfig.json`, ...)
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing (repo contains only `docs/` and `.git/`).
- Produces: a running Next.js app skeleton; `npm test` runs Vitest; `@/*` path alias resolves in both Next and Vitest.

- [ ] **Step 1: Scaffold Next.js into the repo root**

Run (create-next-app tolerates the existing `docs/` and `.git/` entries; if it refuses, temporarily `mv docs ../emojigram-docs-bak`, scaffold, then move it back):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --yes
```

Expected: scaffold completes, `package.json` exists with `next` 15.x.

- [ ] **Step 2: Install test tooling**

```bash
npm install --save-dev vitest vite-tsconfig-paths
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'file:./test.db',
      ANTHROPIC_API_KEY: '',
    },
  },
});
```

(Task 2 adds a `globalSetup` entry once Prisma exists.)

- [ ] **Step 4: Add test scripts to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test** — `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs with the test env', () => {
    expect(process.env.DATABASE_URL).toBe('file:./test.db');
    expect(process.env.ANTHROPIC_API_KEY).toBe('');
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Create .env.example**

```bash
# SQLite database (path is relative to prisma/)
DATABASE_URL="file:./dev.db"
# Optional - without it, emoji translation falls back to the built-in dictionary
ANTHROPIC_API_KEY=""
```

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with Vitest harness"
```

---

### Task 2: Prisma schema, client singleton, and seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `lib/prisma.ts`
- Create: `tests/globalSetup.ts`
- Create: `.env`
- Modify: `vitest.config.ts` (add globalSetup)
- Modify: `package.json` (prisma seed config)
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces: `prisma` singleton (`import { prisma } from '@/lib/prisma'`) with models `User { id, displayName, avatarEmoji, createdAt }`, `Room { id, name, emoji, description }`, `Message { id, roomId, userId, originalText, emojiText: string | null, createdAt }`. Seeded rooms with ids `food`, `movies`, `gaming`, `random`.

- [ ] **Step 1: Install Prisma**

```bash
npm install @prisma/client
npm install --save-dev prisma tsx
```

- [ ] **Step 2: Create prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id          String    @id @default(cuid())
  displayName String
  avatarEmoji String
  createdAt   DateTime  @default(now())
  messages    Message[]
}

model Room {
  id          String    @id
  name        String
  emoji       String
  description String
  messages    Message[]
}

model Message {
  id           String   @id @default(cuid())
  roomId       String
  userId       String
  originalText String
  emojiText    String?
  createdAt    DateTime @default(now())
  room         Room     @relation(fields: [roomId], references: [id])
  user         User     @relation(fields: [userId], references: [id])

  @@index([roomId, createdAt])
}
```

- [ ] **Step 3: Create .env** (git-ignored by the scaffold's .gitignore)

```bash
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=""
```

- [ ] **Step 4: Create lib/prisma.ts** (singleton that survives Next dev HMR)

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Create prisma/seed.ts**

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROOMS = [
  { id: 'food', name: 'Food Talk', emoji: '🍕', description: 'What are you eating?' },
  { id: 'movies', name: 'Movies', emoji: '🎬', description: 'Now showing' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮', description: 'GG only' },
  { id: 'random', name: 'Random', emoji: '💬', description: 'Anything goes' },
];

async function main() {
  for (const room of ROOMS) {
    await prisma.room.upsert({ where: { id: room.id }, update: room, create: room });
  }
}

main().finally(() => prisma.$disconnect());
```

Add to `package.json` (top level, next to `"scripts"`):

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 6: Create dev DB and generate client**

```bash
npx prisma db push
npx prisma db seed
```

Expected: `dev.db` created under `prisma/`, seed prints no errors.

- [ ] **Step 7: Create tests/globalSetup.ts** and wire it up

```ts
import { execSync } from 'node:child_process';

export default function setup() {
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
```

In `vitest.config.ts`, add inside `test`:

```ts
globalSetup: './tests/globalSetup.ts',
```

- [ ] **Step 8: Write the failing DB test** — `tests/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';

describe('database', () => {
  it('creates and reads a user', async () => {
    const user = await prisma.user.create({
      data: { displayName: 'Test', avatarEmoji: '🦖' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.displayName).toBe('Test');
    expect(found?.avatarEmoji).toBe('🦖');
  });

  it('stores messages with nullable emojiText', async () => {
    const user = await prisma.user.create({ data: { displayName: 'T2', avatarEmoji: '🐙' } });
    const room = await prisma.room.create({
      data: { id: 'test-room', name: 'Test', emoji: '🧪', description: 'x' },
    });
    const message = await prisma.message.create({
      data: { roomId: room.id, userId: user.id, originalText: 'hello' },
    });
    expect(message.emojiText).toBeNull();
  });
});
```

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS (globalSetup resets `test.db` each run, so re-runs stay green).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, singleton, and room seed"
```

---

### Task 3: Emoji detection library

**Files:**
- Create: `lib/emoji.ts`
- Test: `tests/emoji.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractEmoji(text: string): string` (concatenation of all RGI emoji sequences found, in order) and `isEmojiOnly(text: string): boolean` (true iff the text, ignoring whitespace, is non-empty and consists solely of emoji).

- [ ] **Step 1: Write the failing tests** — `tests/emoji.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractEmoji, isEmojiOnly } from '@/lib/emoji';

describe('extractEmoji', () => {
  it('keeps only emoji from mixed content', () => {
    expect(extractEmoji('Sure! 🍕 tonight 🌙?')).toBe('🍕🌙');
  });
  it('preserves ZWJ sequences and flags', () => {
    expect(extractEmoji('go 👩‍🚀 to 🇫🇷 now')).toBe('👩‍🚀🇫🇷');
  });
  it('returns empty string when there is no emoji', () => {
    expect(extractEmoji('plain text 123')).toBe('');
  });
});

describe('isEmojiOnly', () => {
  it('accepts pure emoji', () => {
    expect(isEmojiOnly('🍕🌙')).toBe(true);
  });
  it('accepts emoji separated by whitespace', () => {
    expect(isEmojiOnly('🍕 🌙')).toBe(true);
  });
  it('rejects mixed text and emoji', () => {
    expect(isEmojiOnly('pizza 🍕')).toBe(false);
  });
  it('rejects plain text, digits, and empty strings', () => {
    expect(isEmojiOnly('hello')).toBe(false);
    expect(isEmojiOnly('5')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly('   ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/emoji.test.ts`
Expected: FAIL — cannot resolve `@/lib/emoji`.

- [ ] **Step 3: Implement** — `lib/emoji.ts`:

```ts
// \p{RGI_Emoji} (RegExp v flag, Node 20+) matches complete emoji sequences:
// ZWJ families, flags, keycaps, skin tones — not bare digits or '#'.
const RGI_EMOJI = /\p{RGI_Emoji}/gv;

export function extractEmoji(text: string): string {
  return (text.match(RGI_EMOJI) ?? []).join('');
}

export function isEmojiOnly(text: string): boolean {
  const stripped = text.replace(/\s+/g, '');
  return stripped.length > 0 && extractEmoji(stripped) === stripped;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/emoji.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/emoji.ts tests/emoji.test.ts
git commit -m "feat: add emoji extraction and emoji-only detection"
```

---

### Task 4: Word→emoji dictionary translator

**Files:**
- Create: `lib/dictionary.ts`
- Test: `tests/dictionary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `tokenize(text: string): string[]`, `dictionaryTranslate(text: string): string` (emoji for every known word, in order; `'🤷'` when nothing matches), `dictionaryHints(text: string): string` (comma-separated `word → emoji` pairs for known words; used by Task 5 as prompt hints).

- [ ] **Step 1: Write the failing tests** — `tests/dictionary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dictionaryHints, dictionaryTranslate, tokenize } from '@/lib/dictionary';

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Pizza TONIGHT?!')).toEqual(['pizza', 'tonight']);
  });
  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('dictionaryTranslate', () => {
  it('maps known words in order', () => {
    expect(dictionaryTranslate('pizza tonight?')).toBe('🍕🌙');
  });
  it('skips unknown words but keeps known ones', () => {
    expect(dictionaryTranslate('want pizza xyzzy')).toBe('🍕');
  });
  it('handles naive plurals', () => {
    expect(dictionaryTranslate('cats')).toBe('🐱');
  });
  it('falls back to shrug when nothing matches', () => {
    expect(dictionaryTranslate('asdfghjkl qwerty')).toBe('🤷');
  });
});

describe('dictionaryHints', () => {
  it('lists known word mappings', () => {
    expect(dictionaryHints('pizza tonight zzz')).toBe('pizza → 🍕, tonight → 🌙');
  });
  it('returns empty string when nothing matches', () => {
    expect(dictionaryHints('zzz')).toBe('');
  });
});
```

Note: `'want pizza xyzzy'` maps only `pizza` because `want` is intentionally not in the dictionary below — keep it that way or update the test together with the dictionary.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/dictionary.test.ts`
Expected: FAIL — cannot resolve `@/lib/dictionary`.

- [ ] **Step 3: Implement** — `lib/dictionary.ts` (the dictionary is a plain data map; grow it freely later without touching logic):

```ts
export const DICTIONARY: Record<string, string> = {
  // greetings & reactions
  hello: '👋', hi: '👋', hey: '👋', bye: '👋', yes: '👍', no: '👎',
  ok: '👌', okay: '👌', please: '🙏', thanks: '🙏', thank: '🙏', sorry: '🙏',
  love: '❤️', heart: '❤️', like: '👍', good: '👍', great: '🎉', bad: '👎',
  happy: '😊', smile: '😊', sad: '😢', cry: '😭', laugh: '😂', funny: '😂',
  lol: '😂', angry: '😠', mad: '😠', tired: '😴', sleep: '😴', wow: '😮',
  cool: '😎', hot: '🥵', cold: '🥶', sick: '🤒', hug: '🤗', kiss: '😘',
  maybe: '🤷', help: '🆘', stop: '🛑', wait: '⏳', congrats: '🎊', luck: '🍀',
  // time
  time: '⏰', late: '⏰', today: '📅', tomorrow: '📅', tonight: '🌙',
  night: '🌙', morning: '🌅', day: '☀️', week: '🗓️', weekend: '🎉',
  // food & drink
  food: '🍔', eat: '🍽️', hungry: '🤤', dinner: '🍽️', lunch: '🥪',
  breakfast: '🥞', pizza: '🍕', burger: '🍔', taco: '🌮', sushi: '🍣',
  coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', cake: '🍰', icecream: '🍦',
  // activities & things
  party: '🎉', celebrate: '🎉', birthday: '🎂', gift: '🎁', music: '🎵',
  song: '🎵', dance: '💃', movie: '🎬', film: '🎬', game: '🎮', play: '🎮',
  win: '🏆', money: '💰', pay: '💸', buy: '🛒', shop: '🛍️', work: '💼',
  job: '💼', school: '🏫', study: '📚', book: '📖', read: '📖', write: '✍️',
  idea: '💡', think: '🤔', question: '❓', why: '❓', what: '❓',
  phone: '📱', call: '📞', text: '💬', message: '💬', talk: '🗣️',
  run: '🏃', walk: '🚶', gym: '🏋️', soccer: '⚽', football: '🏈',
  basketball: '🏀', ball: '⚽', watch: '👀', see: '👀', look: '👀',
  hear: '👂', listen: '👂', know: '🧠', learn: '📚', fire: '🔥', water: '💧',
  // places & travel
  home: '🏠', house: '🏠', car: '🚗', drive: '🚗', bus: '🚌', train: '🚆',
  plane: '✈️', fly: '✈️', travel: '🧳', trip: '🧳', beach: '🏖️', ocean: '🌊',
  mountain: '⛰️', tree: '🌳', flower: '🌸', star: '⭐', moon: '🌙',
  sun: '☀️', rain: '🌧️', snow: '❄️', world: '🌍',
  // people & animals
  friend: '🫂', family: '👪', baby: '👶', dog: '🐶', cat: '🐱',
  fish: '🐟', bird: '🐦', king: '👑', queen: '👑', strong: '💪',
  doctor: '🩺', medicine: '💊',
  // misc
  new: '✨', fast: '⚡', slow: '🐢', big: '🐘', small: '🐜', magic: '✨',
  cheers: '🥂', goal: '🥅', winner: '🏆', photo: '📷', video: '📹',
};

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function lookup(word: string): string | undefined {
  if (DICTIONARY[word]) return DICTIONARY[word];
  // naive plural: cats -> cat
  if (word.endsWith('s')) return DICTIONARY[word.slice(0, -1)];
  return undefined;
}

export function dictionaryTranslate(text: string): string {
  const hits = tokenize(text)
    .map(lookup)
    .filter((emoji): emoji is string => Boolean(emoji));
  return hits.length > 0 ? hits.join('') : '🤷';
}

export function dictionaryHints(text: string): string {
  return tokenize(text)
    .map((word) => {
      const emoji = lookup(word);
      return emoji ? `${word} → ${emoji}` : null;
    })
    .filter(Boolean)
    .join(', ');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/dictionary.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dictionary.ts tests/dictionary.test.ts
git commit -m "feat: add word-to-emoji dictionary translator"
```

---

### Task 5: Hybrid translation pipeline (dictionary + Claude)

**Files:**
- Create: `lib/translate.ts`
- Test: `tests/translate.test.ts`

**Interfaces:**
- Consumes: `dictionaryTranslate`, `dictionaryHints` (Task 4); `extractEmoji`, `isEmojiOnly` (Task 3).
- Produces: `type Translation = { emoji: string; fallback: boolean }`, `type ClaudeCaller = (text: string, hints: string) => Promise<string>`, `translate(text: string, claudeCall?: ClaudeCaller): Promise<Translation>`, `clearTranslationCache(): void`. `fallback: true` means the dictionary-only path was used (Claude unavailable/failed) — callers must NOT persist those.

- [ ] **Step 1: Install the Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing tests** — `tests/translate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTranslationCache, translate } from '@/lib/translate';

// vitest.config.ts sets ANTHROPIC_API_KEY='' — tests control it per-case.
describe('translate', () => {
  beforeEach(() => {
    clearTranslationCache();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('passes through messages that are already pure emoji', async () => {
    const claude = vi.fn();
    expect(await translate('🍕🌙', claude)).toEqual({ emoji: '🍕🌙', fallback: false });
    expect(claude).not.toHaveBeenCalled();
  });

  it('uses Claude and sanitizes the response to emoji only', async () => {
    const claude = vi.fn().mockResolvedValue('Sure: 🍕❓🌙');
    expect(await translate('pizza tonight?', claude)).toEqual({ emoji: '🍕❓🌙', fallback: false });
    expect(claude).toHaveBeenCalledWith('pizza tonight?', expect.stringContaining('pizza → 🍕'));
  });

  it('caches successful translations (one Claude call per unique text)', async () => {
    const claude = vi.fn().mockResolvedValue('🍕');
    await translate('pizza', claude);
    await translate('PIZZA  ', claude); // trim + case-insensitive key
    expect(claude).toHaveBeenCalledTimes(1);
  });

  it('falls back to the dictionary when Claude throws, without caching', async () => {
    const claude = vi.fn().mockRejectedValue(new Error('timeout'));
    expect(await translate('pizza tonight', claude)).toEqual({ emoji: '🍕🌙', fallback: true });
    // a later call retries Claude (fallback was not cached)
    await translate('pizza tonight', claude);
    expect(claude).toHaveBeenCalledTimes(2);
  });

  it('falls back when Claude returns no usable emoji', async () => {
    const claude = vi.fn().mockResolvedValue('I cannot do that');
    expect(await translate('pizza', claude)).toEqual({ emoji: '🍕', fallback: true });
  });

  it('skips Claude entirely when no API key is set', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const claude = vi.fn();
    expect(await translate('pizza tonight', claude)).toEqual({ emoji: '🍕🌙', fallback: true });
    expect(claude).not.toHaveBeenCalled();
  });

  it('shrugs at untranslatable input with no key', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    expect(await translate('asdfghjkl', vi.fn())).toEqual({ emoji: '🤷', fallback: true });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/translate.test.ts`
Expected: FAIL — cannot resolve `@/lib/translate`.

- [ ] **Step 4: Implement** — `lib/translate.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { dictionaryHints, dictionaryTranslate } from './dictionary';
import { extractEmoji, isEmojiOnly } from './emoji';

export type Translation = { emoji: string; fallback: boolean };
export type ClaudeCaller = (text: string, hints: string) => Promise<string>;

const SYSTEM_PROMPT = `You translate short chat messages into emoji sequences.
Rules:
- Respond with ONLY emoji characters. No words, letters, digits, or punctuation.
- Convey the meaning and tone of the whole message, in reading order.
- Use 1-12 emoji. Prefer a few expressive emoji over many literal ones.
- Always produce something, even for nonsense input.`;

const cache = new Map<string, string>();

// Lazy: constructing Anthropic() without a key throws, and the app must
// import cleanly (and run in dictionary-fallback mode) with no key set.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  return (client ??= new Anthropic({ timeout: 5_000, maxRetries: 1 }));
}

async function callClaude(text: string, hints: string): Promise<string> {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: hints
          ? `Message: ${text}\nDictionary suggestions (use if helpful): ${hints}`
          : `Message: ${text}`,
      },
    ],
  });
  const block = response.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

export function clearTranslationCache(): void {
  cache.clear();
}

export async function translate(
  text: string,
  claudeCall: ClaudeCaller = callClaude,
): Promise<Translation> {
  const trimmed = text.trim();
  if (isEmojiOnly(trimmed)) return { emoji: trimmed, fallback: false };

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached) return { emoji: cached, fallback: false };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { emoji: dictionaryTranslate(trimmed), fallback: true };
  }

  try {
    const raw = await claudeCall(trimmed, dictionaryHints(trimmed));
    const emoji = extractEmoji(raw);
    if (!emoji) return { emoji: dictionaryTranslate(trimmed), fallback: true };
    cache.set(key, emoji);
    return { emoji, fallback: false };
  } catch {
    return { emoji: dictionaryTranslate(trimmed), fallback: true };
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/translate.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/translate.ts tests/translate.test.ts package.json package-lock.json
git commit -m "feat: add hybrid dictionary+Claude translation pipeline"
```

---

### Task 6: Rate limiter

**Files:**
- Create: `lib/rateLimit.ts`
- Test: `tests/rateLimit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `checkRateLimit(userId: string, now?: number): boolean` (true = allowed; records the send), `resetRateLimits(): void`.

- [ ] **Step 1: Write the failing tests** — `tests/rateLimit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimits } from '@/lib/rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows the first message', () => {
    expect(checkRateLimit('u1', 1_000)).toBe(true);
  });

  it('blocks a second message within 2 seconds', () => {
    checkRateLimit('u1', 1_000);
    expect(checkRateLimit('u1', 2_500)).toBe(false);
  });

  it('allows again after the window', () => {
    checkRateLimit('u1', 1_000);
    expect(checkRateLimit('u1', 3_000)).toBe(true);
  });

  it('tracks users independently', () => {
    checkRateLimit('u1', 1_000);
    expect(checkRateLimit('u2', 1_100)).toBe(true);
  });

  it('a blocked attempt does not extend the window', () => {
    checkRateLimit('u1', 1_000);
    checkRateLimit('u1', 2_500); // blocked
    expect(checkRateLimit('u1', 3_000)).toBe(true); // 2s after the ALLOWED send
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/rateLimit.test.ts`
Expected: FAIL — cannot resolve `@/lib/rateLimit`.

- [ ] **Step 3: Implement** — `lib/rateLimit.ts`:

```ts
const WINDOW_MS = 2_000;

const globalStore = globalThis as unknown as { __rateLimits?: Map<string, number> };
const lastAllowed = (globalStore.__rateLimits ??= new Map<string, number>());

export function checkRateLimit(userId: string, now: number = Date.now()): boolean {
  const last = lastAllowed.get(userId);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  lastAllowed.set(userId, now);
  return true;
}

export function resetRateLimits(): void {
  lastAllowed.clear();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/rateLimit.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rateLimit.ts tests/rateLimit.test.ts
git commit -m "feat: add per-user message rate limiter"
```

---

### Task 7: In-memory SSE hub (subscriptions + presence)

**Files:**
- Create: `lib/sse.ts`
- Test: `tests/sse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PresenceMember = { userId: string; displayName: string; avatarEmoji: string }`
  - `type RoomEvent = { type: 'message'; message: BroadcastMessage } | { type: 'presence'; members: PresenceMember[] }`
  - `type BroadcastMessage = { id: string; roomId: string; userId: string; displayName: string; avatarEmoji: string; originalText: string; createdAt: string }`
  - `join(roomId: string, member: PresenceMember, subscriber: (event: RoomEvent) => void): () => void` — subscribes, adds presence, broadcasts a presence event; the returned function leaves (unsubscribes + removes presence + broadcasts presence).
  - `broadcast(roomId: string, event: RoomEvent): void`
  - `presenceMembers(roomId: string): PresenceMember[]`
  - `memberCount(roomId: string): number`
- Known MVP limitation (document in code): presence is keyed by userId, so the same user in two tabs counts once and leaves when either tab closes.

- [ ] **Step 1: Write the failing tests** — `tests/sse.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { broadcast, join, memberCount, presenceMembers, type RoomEvent } from '@/lib/sse';

const member = (id: string) => ({ userId: id, displayName: id, avatarEmoji: '🦖' });

describe('sse hub', () => {
  it('delivers broadcasts to subscribers in the same room only', () => {
    const gotA: RoomEvent[] = [];
    const gotB: RoomEvent[] = [];
    const leaveA = join('room-a', member('a1'), (e) => gotA.push(e));
    const leaveB = join('room-b', member('b1'), (e) => gotB.push(e));

    const event: RoomEvent = {
      type: 'message',
      message: {
        id: 'm1', roomId: 'room-a', userId: 'a1', displayName: 'a1',
        avatarEmoji: '🦖', originalText: 'hi', createdAt: new Date().toISOString(),
      },
    };
    broadcast('room-a', event);

    expect(gotA).toContainEqual(event);
    expect(gotB.some((e) => e.type === 'message')).toBe(false);
    leaveA(); leaveB();
  });

  it('tracks presence on join and leave, broadcasting updates', () => {
    const got: RoomEvent[] = [];
    const leave1 = join('room-p', member('p1'), (e) => got.push(e));
    expect(memberCount('room-p')).toBe(1);

    const leave2 = join('room-p', member('p2'), () => {});
    expect(memberCount('room-p')).toBe(2);
    expect(presenceMembers('room-p').map((m) => m.userId).sort()).toEqual(['p1', 'p2']);
    // p1 heard about p2 joining
    expect(got.filter((e) => e.type === 'presence').length).toBeGreaterThanOrEqual(2);

    leave2();
    expect(memberCount('room-p')).toBe(1);
    leave1();
    expect(memberCount('room-p')).toBe(0);
  });

  it('stops delivering after leave', () => {
    const fn = vi.fn();
    const leave = join('room-x', member('x1'), fn);
    leave();
    fn.mockClear();
    broadcast('room-x', { type: 'presence', members: [] });
    expect(fn).not.toHaveBeenCalled();
  });

  it('survives a subscriber that throws', () => {
    const bad = join('room-t', member('t-bad'), () => { throw new Error('dead client'); });
    const fn = vi.fn();
    const good = join('room-t', member('t-good'), fn);
    expect(() => broadcast('room-t', { type: 'presence', members: [] })).not.toThrow();
    expect(fn).toHaveBeenCalled();
    bad(); good();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sse.test.ts`
Expected: FAIL — cannot resolve `@/lib/sse`.

- [ ] **Step 3: Implement** — `lib/sse.ts`:

```ts
export type PresenceMember = { userId: string; displayName: string; avatarEmoji: string };

export type BroadcastMessage = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  originalText: string;
  createdAt: string;
};

export type RoomEvent =
  | { type: 'message'; message: BroadcastMessage }
  | { type: 'presence'; members: PresenceMember[] };

type Subscriber = (event: RoomEvent) => void;

type Hub = {
  subscribers: Map<string, Set<Subscriber>>;
  // Presence keyed by userId: same user in two tabs counts once and leaves
  // when either tab closes. Acceptable for the MVP.
  presence: Map<string, Map<string, PresenceMember>>;
};

// Survives Next dev HMR module reloads; in-memory only (single-process realtime).
const globalStore = globalThis as unknown as { __emojigramHub?: Hub };
const hub = (globalStore.__emojigramHub ??= {
  subscribers: new Map(),
  presence: new Map(),
});

export function broadcast(roomId: string, event: RoomEvent): void {
  for (const subscriber of hub.subscribers.get(roomId) ?? []) {
    try {
      subscriber(event);
    } catch {
      // Dead client mid-write; its unsubscribe cleans up on disconnect.
    }
  }
}

export function presenceMembers(roomId: string): PresenceMember[] {
  return [...(hub.presence.get(roomId)?.values() ?? [])];
}

export function memberCount(roomId: string): number {
  return hub.presence.get(roomId)?.size ?? 0;
}

export function join(roomId: string, member: PresenceMember, subscriber: Subscriber): () => void {
  let subs = hub.subscribers.get(roomId);
  if (!subs) hub.subscribers.set(roomId, (subs = new Set()));
  subs.add(subscriber);

  let members = hub.presence.get(roomId);
  if (!members) hub.presence.set(roomId, (members = new Map()));
  members.set(member.userId, member);
  broadcast(roomId, { type: 'presence', members: presenceMembers(roomId) });

  return () => {
    subs.delete(subscriber);
    hub.presence.get(roomId)?.delete(member.userId);
    broadcast(roomId, { type: 'presence', members: presenceMembers(roomId) });
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/sse.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sse.ts tests/sse.test.ts
git commit -m "feat: add in-memory SSE hub with presence tracking"
```

---

### Task 8: API routes — users and rooms

**Files:**
- Create: `app/api/users/route.ts`
- Create: `app/api/rooms/route.ts`
- Test: `tests/api.users-rooms.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `memberCount` (Task 7).
- Produces:
  - `POST /api/users` body `{ displayName, avatarEmoji }` → 201 with the created User JSON; 400 on invalid input.
  - `GET /api/rooms` → 200 with `Array<{ id, name, emoji, description, latestMessage: { emojiText: string | null, createdAt } | null, memberCount: number }>`.

- [ ] **Step 1: Write the failing tests** — `tests/api.users-rooms.test.ts` (route handlers are called directly as functions; Next 15 passes `params` as a Promise):

```ts
import { describe, expect, it } from 'vitest';
import { POST as createUser } from '@/app/api/users/route';
import { GET as listRooms } from '@/app/api/rooms/route';
import { prisma } from '@/lib/prisma';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/users', () => {
  it('creates a guest user', async () => {
    const res = await createUser(
      jsonRequest('http://test/api/users', { displayName: 'Allen', avatarEmoji: '🦈' }),
    );
    expect(res.status).toBe(201);
    const user = await res.json();
    expect(user.id).toBeTruthy();
    expect(user.displayName).toBe('Allen');
  });

  it('rejects missing or oversized fields', async () => {
    for (const body of [
      {},
      { displayName: '', avatarEmoji: '🦈' },
      { displayName: 'x'.repeat(31), avatarEmoji: '🦈' },
      { displayName: 'ok', avatarEmoji: '' },
    ]) {
      const res = await createUser(jsonRequest('http://test/api/users', body));
      expect(res.status).toBe(400);
    }
  });

  it('rejects malformed JSON', async () => {
    const res = await createUser(
      new Request('http://test/api/users', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms', () => {
  it('lists rooms with latest message and member count', async () => {
    const room = await prisma.room.upsert({
      where: { id: 'rooms-test' },
      update: {},
      create: { id: 'rooms-test', name: 'Rooms Test', emoji: '🧪', description: 'x' },
    });
    const user = await prisma.user.create({ data: { displayName: 'R', avatarEmoji: '🐟' } });
    await prisma.message.create({
      data: { roomId: room.id, userId: user.id, originalText: 'hi', emojiText: '👋' },
    });

    const res = await listRooms();
    expect(res.status).toBe(200);
    const rooms = await res.json();
    const found = rooms.find((r: { id: string }) => r.id === 'rooms-test');
    expect(found.latestMessage.emojiText).toBe('👋');
    expect(found.memberCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/api.users-rooms.test.ts`
Expected: FAIL — routes do not exist.

- [ ] **Step 3: Implement** — `app/api/users/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const displayName =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const avatarEmoji =
    typeof body?.avatarEmoji === 'string' ? body.avatarEmoji.trim() : '';

  if (!displayName || displayName.length > 30 || !avatarEmoji || avatarEmoji.length > 8) {
    return NextResponse.json(
      { error: 'displayName (1-30 chars) and avatarEmoji are required' },
      { status: 400 },
    );
  }

  const user = await prisma.user.create({ data: { displayName, avatarEmoji } });
  return NextResponse.json(user, { status: 201 });
}
```

And `app/api/rooms/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { memberCount } from '@/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rooms = await prisma.room.findMany({
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return NextResponse.json(
    rooms.map((room) => ({
      id: room.id,
      name: room.name,
      emoji: room.emoji,
      description: room.description,
      latestMessage: room.messages[0]
        ? { emojiText: room.messages[0].emojiText, createdAt: room.messages[0].createdAt }
        : null,
      memberCount: memberCount(room.id),
    })),
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/api.users-rooms.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api tests/api.users-rooms.test.ts
git commit -m "feat: add users and rooms API routes"
```

---

### Task 9: API routes — messages (GET/POST) and SSE stream

**Files:**
- Create: `app/api/rooms/[id]/messages/route.ts`
- Create: `app/api/rooms/[id]/stream/route.ts`
- Test: `tests/api.messages.test.ts`

**Interfaces:**
- Consumes: `prisma`, `checkRateLimit`/`resetRateLimits`, `broadcast`/`join` + types (Tasks 2, 6, 7).
- Produces:
  - `GET /api/rooms/[id]/messages` → 200, last 50 messages oldest-first, each including `user: { displayName, avatarEmoji }`.
  - `POST /api/rooms/[id]/messages` body `{ userId, text }` → 201 with the Message; 400 (empty/too long/bad body), 404 (unknown user/room), 429 (rate limited). Stores text only — NO translation in the send path. Broadcasts a `message` RoomEvent.
  - `GET /api/rooms/[id]/stream?userId=&displayName=&avatarEmoji=` → SSE stream of `data: <RoomEvent JSON>\n\n` frames; joins presence on connect, leaves on abort.

- [ ] **Step 1: Write the failing tests** — `tests/api.messages.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getMessages, POST as postMessage } from '@/app/api/rooms/[id]/messages/route';
import { prisma } from '@/lib/prisma';
import { resetRateLimits } from '@/lib/rateLimit';
import { join, type RoomEvent } from '@/lib/sse';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function post(roomId: string, body: unknown): Promise<Response> {
  return postMessage(
    new Request(`http://test/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(roomId),
  );
}

async function fixtures() {
  const user = await prisma.user.create({ data: { displayName: 'M', avatarEmoji: '🐧' } });
  const room = await prisma.room.upsert({
    where: { id: 'msg-test' },
    update: {},
    create: { id: 'msg-test', name: 'Msg Test', emoji: '🧪', description: 'x' },
  });
  return { user, room };
}

describe('POST /api/rooms/[id]/messages', () => {
  beforeEach(() => resetRateLimits());

  it('stores text as-is (no translation in the send path) and broadcasts', async () => {
    const { user, room } = await fixtures();
    const events: RoomEvent[] = [];
    const leave = join(room.id, { userId: 'observer', displayName: 'O', avatarEmoji: '👀' },
      (e) => events.push(e));

    const res = await post(room.id, { userId: user.id, text: 'pizza tonight?' });
    expect(res.status).toBe(201);
    const message = await res.json();
    expect(message.originalText).toBe('pizza tonight?');
    expect(message.emojiText).toBeNull();

    const msgEvent = events.find((e) => e.type === 'message');
    expect(msgEvent && msgEvent.type === 'message' && msgEvent.message.originalText)
      .toBe('pizza tonight?');
    leave();
  });

  it('rejects empty, whitespace-only, and oversized messages', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: user.id, text: '' })).status).toBe(400);
    expect((await post(room.id, { userId: user.id, text: '   ' })).status).toBe(400);
    expect((await post(room.id, { userId: user.id, text: 'x'.repeat(501) })).status).toBe(400);
  });

  it('404s for unknown user or room', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: 'nope', text: 'hi' })).status).toBe(404);
    expect((await post('no-room', { userId: user.id, text: 'hi' })).status).toBe(404);
  });

  it('rate limits a second message within 2 seconds', async () => {
    const { user, room } = await fixtures();
    expect((await post(room.id, { userId: user.id, text: 'one' })).status).toBe(201);
    expect((await post(room.id, { userId: user.id, text: 'two' })).status).toBe(429);
  });
});

describe('GET /api/rooms/[id]/messages', () => {
  it('returns messages oldest-first with sender info', async () => {
    const { user, room } = await fixtures();
    await prisma.message.deleteMany({ where: { roomId: room.id } });
    await prisma.message.create({ data: { roomId: room.id, userId: user.id, originalText: 'first' } });
    await prisma.message.create({ data: { roomId: room.id, userId: user.id, originalText: 'second' } });

    const res = await getMessages(
      new Request(`http://test/api/rooms/${room.id}/messages`), ctx(room.id));
    expect(res.status).toBe(200);
    const messages = await res.json();
    expect(messages.at(-1).originalText).toBe('second');
    expect(messages.at(-1).user.avatarEmoji).toBe('🐧');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/api.messages.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement** — `app/api/rooms/[id]/messages/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { broadcast } from '@/lib/sse';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id: roomId } = await params;
  const messages = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { displayName: true, avatarEmoji: true } } },
  });
  return NextResponse.json(messages.reverse());
}

export async function POST(req: Request, { params }: Ctx) {
  const { id: roomId } = await params;
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!userId || !text) {
    return NextResponse.json({ error: 'userId and non-empty text are required' }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
  }

  const [user, room] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.room.findUnique({ where: { id: roomId } }),
  ]);
  if (!user || !room) {
    return NextResponse.json({ error: 'Unknown user or room' }, { status: 404 });
  }

  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'Slow down — one message every 2 seconds' },
      { status: 429 },
    );
  }

  // Send path stores text only; emoji translation happens at first display
  // via GET /api/messages/[id]/emoji.
  const message = await prisma.message.create({
    data: { roomId, userId, originalText: text },
  });

  broadcast(roomId, {
    type: 'message',
    message: {
      id: message.id,
      roomId,
      userId,
      displayName: user.displayName,
      avatarEmoji: user.avatarEmoji,
      originalText: message.originalText,
      createdAt: message.createdAt.toISOString(),
    },
  });

  return NextResponse.json(message, { status: 201 });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/api.messages.test.ts`
Expected: all PASS.

- [ ] **Step 5: Implement the SSE stream route** — `app/api/rooms/[id]/stream/route.ts` (exercised end-to-end by the Playwright test in Task 15; the hub logic it delegates to is already unit-tested):

```ts
import { join, type RoomEvent } from '@/lib/sse';

export const dynamic = 'force-dynamic';

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
    return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  let leave: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RoomEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          leave?.();
        }
      };
      leave = join(roomId, member, send);
      req.signal.addEventListener('abort', () => {
        leave?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      leave?.();
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
```

- [ ] **Step 6: Verify everything still builds and tests pass**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/api tests/api.messages.test.ts
git commit -m "feat: add message send/list API and SSE stream route"
```

---

### Task 10: API route — emoji translation with caching

**Files:**
- Create: `app/api/messages/[id]/emoji/route.ts`
- Test: `tests/api.emoji.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `translate`/`clearTranslationCache` (Task 5).
- Produces: `GET /api/messages/[id]/emoji` → 200 `{ emoji: string, fallback: boolean, cached: boolean }`; 404 for unknown message. First successful call persists `emojiText` on the message; fallback results are NOT persisted (a later view retries the full translation).

- [ ] **Step 1: Write the failing tests** — `tests/api.emoji.test.ts` (test env has `ANTHROPIC_API_KEY=''`, so uncached translations take the dictionary-fallback path deterministically):

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getEmoji } from '@/app/api/messages/[id]/emoji/route';
import { prisma } from '@/lib/prisma';
import { clearTranslationCache } from '@/lib/translate';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://test/api/messages/${id}/emoji`);

async function makeMessage(originalText: string, emojiText?: string) {
  const user = await prisma.user.create({ data: { displayName: 'E', avatarEmoji: '🐳' } });
  const room = await prisma.room.upsert({
    where: { id: 'emoji-test' },
    update: {},
    create: { id: 'emoji-test', name: 'Emoji Test', emoji: '🧪', description: 'x' },
  });
  return prisma.message.create({
    data: { roomId: room.id, userId: user.id, originalText, emojiText },
  });
}

describe('GET /api/messages/[id]/emoji', () => {
  beforeEach(() => clearTranslationCache());

  it('404s for an unknown message', async () => {
    expect((await getEmoji(req('nope'), ctx('nope'))).status).toBe(404);
  });

  it('returns the stored emojiText without re-translating', async () => {
    const message = await makeMessage('pizza', '🍕');
    const res = await getEmoji(req(message.id), ctx(message.id));
    expect(await res.json()).toEqual({ emoji: '🍕', fallback: false, cached: true });
  });

  it('translates on first request; fallback results are not persisted', async () => {
    const message = await makeMessage('pizza tonight');
    const res = await getEmoji(req(message.id), ctx(message.id));
    // No API key in the test env -> dictionary fallback
    expect(await res.json()).toEqual({ emoji: '🍕🌙', fallback: true, cached: false });

    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stored?.emojiText).toBeNull(); // NOT cached, so a later view can retry Claude

    const again = await getEmoji(req(message.id), ctx(message.id));
    expect((await again.json()).cached).toBe(false);
  });

  it('persists pass-through translations of already-emoji messages', async () => {
    const message = await makeMessage('🎉🎉');
    const res = await getEmoji(req(message.id), ctx(message.id));
    expect(await res.json()).toEqual({ emoji: '🎉🎉', fallback: false, cached: false });
    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stored?.emojiText).toBe('🎉🎉'); // fallback=false -> persisted
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/api.emoji.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement** — `app/api/messages/[id]/emoji/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { translate } from '@/lib/translate';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if (message.emojiText) {
    return NextResponse.json({ emoji: message.emojiText, fallback: false, cached: true });
  }

  const { emoji, fallback } = await translate(message.originalText);
  if (!fallback) {
    // Persist only real translations; fallbacks stay uncached so a later
    // view retries the full pipeline once Claude is reachable again.
    await prisma.message.update({ where: { id }, data: { emojiText: emoji } });
  }
  return NextResponse.json({ emoji, fallback, cached: false });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/api.emoji.test.ts`
Expected: all PASS. Then run the full suite: `npm test` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/messages tests/api.emoji.test.ts
git commit -m "feat: add display-time emoji translation endpoint with caching"
```

---

### Task 11: Identity helpers + welcome screen

**Files:**
- Create: `lib/identity.ts`
- Create: `components/AvatarPicker.tsx`
- Modify: `app/page.tsx` (replace scaffold content)
- Modify: `app/layout.tsx` (title/description metadata)

**Interfaces:**
- Consumes: `POST /api/users` (Task 8).
- Produces: `type Identity = { userId: string; displayName: string; avatarEmoji: string }`, `loadIdentity(): Identity | null`, `saveIdentity(identity: Identity): void` (localStorage key `emojigram-identity`); `<AvatarPicker value onChange />`. Welcome page at `/` with `data-testid`s: `name-input`, `avatar-<emoji>`, `join-button` (used by Task 15's E2E).

- [ ] **Step 1: Create lib/identity.ts**

```ts
export type Identity = { userId: string; displayName: string; avatarEmoji: string };

const KEY = 'emojigram-identity';

export function loadIdentity(): Identity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity): void {
  localStorage.setItem(KEY, JSON.stringify(identity));
}
```

- [ ] **Step 2: Create components/AvatarPicker.tsx**

```tsx
'use client';

const AVATARS = [
  '🦖', '🐙', '🦊', '🐼', '🦄', '🐸', '🦈', '🐧',
  '🦋', '🐢', '🦁', '🐨', '🐯', '🦜', '🐬', '🦉',
  '🍕', '🌮', '🍩', '🍉', '⚡', '🌈', '🔥', '⭐',
  '🎸', '🎮', '🚀', '🏀', '🎨', '🧠', '👻', '🤖',
];

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {AVATARS.map((emoji) => (
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
  );
}
```

- [ ] **Step 3: Replace app/page.tsx with the welcome screen**

```tsx
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Update metadata in app/layout.tsx**

Change the exported `metadata` to:

```ts
export const metadata: Metadata = {
  title: 'Emojigram',
  description: 'Chat where every message arrives as emoji',
};
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: build succeeds. (Behavior is verified end-to-end in Task 15.)

- [ ] **Step 6: Commit**

```bash
git add lib/identity.ts components/AvatarPicker.tsx app/page.tsx app/layout.tsx
git commit -m "feat: add guest identity and welcome screen"
```

---

### Task 12: Room list screen

**Files:**
- Create: `components/RoomCard.tsx`
- Create: `app/rooms/page.tsx`

**Interfaces:**
- Consumes: `GET /api/rooms` (Task 8), `loadIdentity` (Task 11).
- Produces: `/rooms` page; each room card links to `/rooms/<id>` with `data-testid="room-card-<id>"` (used by Task 15).

- [ ] **Step 1: Create components/RoomCard.tsx**

```tsx
import Link from 'next/link';

export type RoomSummary = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  latestMessage: { emojiText: string | null; createdAt: string } | null;
  memberCount: number;
};

export default function RoomCard({ room }: { room: RoomSummary }) {
  return (
    <Link
      href={`/rooms/${room.id}`}
      data-testid={`room-card-${room.id}`}
      className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 transition hover:border-violet-400 hover:shadow"
    >
      <span className="text-3xl">{room.emoji}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{room.name}</h2>
        <p className="truncate text-sm text-gray-500">
          {room.latestMessage?.emojiText ?? room.description}
        </p>
      </div>
      <span className="text-sm text-gray-400">
        {room.memberCount > 0 ? `🟢 ${room.memberCount}` : ''}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Create app/rooms/page.tsx**

```tsx
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
      .then((res) => res.json())
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
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/RoomCard.tsx app/rooms/page.tsx
git commit -m "feat: add room list screen"
```

---

### Task 13: Chat room screen (bubbles, composer, presence, live stream)

**Files:**
- Create: `hooks/useRoomStream.ts`
- Create: `components/MessageBubble.tsx`
- Create: `components/Composer.tsx`
- Create: `components/PresenceStrip.tsx`
- Create: `app/rooms/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/rooms/[id]/messages`, `GET /api/rooms/[id]/stream` (Task 9), `GET /api/messages/[id]/emoji` (Task 10), `Identity` (Task 11), `RoomEvent`/`PresenceMember`/`BroadcastMessage` types (Task 7).
- Produces: `/rooms/[id]` chat page. `data-testid`s for Task 15: `composer-input`, `send-button`, `message-bubble` (one per message; bubble face shows emoji, click flips to original text).
- Key behaviors: sender's own message arrives via its SSE echo (no optimistic append — messages are deduped by id anyway); on every EventSource `open` (including auto-reconnects) the message list is refetched so no messages are missed.

- [ ] **Step 1: Create hooks/useRoomStream.ts**

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { BroadcastMessage, PresenceMember, RoomEvent } from '@/lib/sse';
import type { Identity } from '@/lib/identity';

export type ChatMessage = {
  id: string;
  userId: string;
  originalText: string;
  createdAt: string;
  user: { displayName: string; avatarEmoji: string };
};

function toChatMessage(m: BroadcastMessage): ChatMessage {
  return {
    id: m.id,
    userId: m.userId,
    originalText: m.originalText,
    createdAt: m.createdAt,
    user: { displayName: m.displayName, avatarEmoji: m.avatarEmoji },
  };
}

export function useRoomStream(roomId: string, identity: Identity | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!identity) return;
    let closed = false;

    const addMessages = (incoming: ChatMessage[]) => {
      setMessages((prev) => {
        const fresh = incoming.filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    };

    const refetch = () =>
      fetch(`/api/rooms/${roomId}/messages`)
        .then((res) => res.json())
        .then((history: ChatMessage[]) => !closed && addMessages(history))
        .catch(() => {});

    const qs = new URLSearchParams({
      userId: identity.userId,
      displayName: identity.displayName,
      avatarEmoji: identity.avatarEmoji,
    });
    const source = new EventSource(`/api/rooms/${roomId}/stream?${qs}`);

    // Fires on first connect AND every auto-reconnect: refetch fills any gap.
    source.onopen = () => refetch();
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as RoomEvent;
      if (event.type === 'message') addMessages([toChatMessage(event.message)]);
      if (event.type === 'presence') setMembers(event.members);
    };

    return () => {
      closed = true;
      source.close();
    };
  }, [roomId, identity]);

  return { messages, members };
}
```

- [ ] **Step 2: Create components/MessageBubble.tsx**

```tsx
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
      .then((res) => res.json())
      .then((data: { emoji: string; fallback: boolean }) => {
        if (cancelled) return;
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
          {message.user.avatarEmoji} {message.user.displayName}
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
                <span className="ml-1 align-middle text-[10px] opacity-60">🤖💤</span>
              )}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create components/Composer.tsx**

```tsx
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
```

- [ ] **Step 4: Create components/PresenceStrip.tsx**

```tsx
import type { PresenceMember } from '@/lib/sse';

export default function PresenceStrip({ members }: { members: PresenceMember[] }) {
  return (
    <div className="flex items-center gap-1 text-lg" title={members.map((m) => m.displayName).join(', ')}>
      {members.slice(0, 8).map((m) => (
        <span key={m.userId}>{m.avatarEmoji}</span>
      ))}
      {members.length > 8 && <span className="text-xs text-gray-400">+{members.length - 8}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Create app/rooms/[id]/page.tsx**

```tsx
'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Composer from '@/components/Composer';
import MessageBubble from '@/components/MessageBubble';
import PresenceStrip from '@/components/PresenceStrip';
import { useRoomStream } from '@/hooks/useRoomStream';
import { loadIdentity, type Identity } from '@/lib/identity';

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const { messages, members } = useRoomStream(roomId, identity);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadIdentity();
    if (!stored) router.replace('/');
    else setIdentity(stored);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string): Promise<string | null> {
    if (!identity) return 'Not signed in';
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: identity.userId, text }),
    });
    if (!res.ok) return (await res.json()).error ?? 'Failed to send';
    return null; // message arrives via the SSE echo
  }

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <Link href="/rooms" className="text-sm text-violet-600">← Rooms</Link>
        <PresenceStrip members={members} />
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.userId === identity?.userId}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <Composer onSend={send} />
    </main>
  );
}
```

- [ ] **Step 6: Verify build and full test suite**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 7: Manual smoke check**

Run `npm run dev`, open two browser windows at `http://localhost:3000`, join with different names, enter Food Talk in both, send "pizza tonight?" from one. Expected: the other window shows a shimmering bubble that resolves to 🍕🌙 (dictionary fallback without an API key), presence shows both avatars, clicking the bubble reveals "pizza tonight?". Stop the dev server afterwards.

- [ ] **Step 8: Commit**

```bash
git add hooks components app/rooms
git commit -m "feat: add chat room screen with live emoji bubbles"
```

---

### Task 14: Playwright E2E smoke test + README

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/chat.spec.ts`
- Create: `README.md` (replace scaffold README)
- Modify: `package.json` (e2e script)
- Modify: `.gitignore` (Playwright artifacts)

**Interfaces:**
- Consumes: the whole app via HTTP; `data-testid`s from Tasks 11–13.
- Produces: `npm run e2e` — two browser contexts chat live; deterministic because the dev server runs with no `ANTHROPIC_API_KEY` (dictionary fallback: "pizza tonight?" → 🍕🌙).

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npx prisma db push && npx prisma db seed && npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: 'file:./dev.db', ANTHROPIC_API_KEY: '' },
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add script + gitignore entries**

`package.json` scripts: `"e2e": "playwright test"`.
Append to `.gitignore`:

```
/test-results/
/playwright-report/
*.db
```

- [ ] **Step 4: Write the E2E test** — `e2e/chat.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

async function joinAs(page: Page, name: string, avatar: string) {
  await page.goto('/');
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByTestId('join-button').click();
  await page.waitForURL('**/rooms');
  await page.getByTestId('room-card-food').click();
  await page.waitForURL('**/rooms/food');
}

test('two users chat: text goes in, emoji comes out, tap reveals original', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  await joinAs(alice, 'Alice', '🦊');
  await joinAs(bob, 'Bob', '🐙');

  // Alice sends plain text
  await alice.getByTestId('composer-input').fill('pizza tonight?');
  await alice.getByTestId('send-button').click();

  // Bob receives it live and it resolves to emoji (dictionary: pizza->🍕, tonight->🌙)
  const bobBubble = bob.getByTestId('message-bubble').last();
  await expect(bobBubble).toContainText('🍕', { timeout: 15_000 });
  await expect(bobBubble).toContainText('🌙');
  await expect(bobBubble).not.toContainText('pizza');

  // Tap to reveal the original text
  await bobBubble.click();
  await expect(bobBubble).toContainText('pizza tonight?');

  // Presence: Bob sees Alice's avatar in the strip
  await expect(bob.locator('header')).toContainText('🦊');

  await contextA.close();
  await contextB.close();
});
```

- [ ] **Step 5: Run the E2E test**

Run: `npm run e2e`
Expected: 1 passed. (If flaky on first run, `npx playwright install` may need to finish or port 3000 must be free.)

- [ ] **Step 6: Write README.md** (replace the scaffold README):

```markdown
# Emojigram 💬

Chat where every message arrives as emoji. Type anything — it's sent and stored
as text, translated to an emoji sequence the first time anyone sees it
(built-in dictionary + Claude Haiku), and cached. Tap a bubble to reveal the
original text.

## Stack

Next.js 15 · TypeScript · Tailwind · Prisma + SQLite · Server-Sent Events ·
Claude API (claude-haiku-4-5) · Vitest · Playwright

## Run it

    npm install
    npx prisma db push && npx prisma db seed
    npm run dev

Open http://localhost:3000 in two windows and start chatting.

Optional: copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` for
AI-powered translations. Without a key the app still works using the built-in
word→emoji dictionary (messages get a 🤖💤 "rough translation" marker).

## Tests

    npm test      # unit + API tests (Vitest)
    npm run e2e   # two-browser live chat smoke test (Playwright)

## Design docs

- Spec: docs/superpowers/specs/2026-07-06-emojigram-design.md
- Plan: docs/superpowers/plans/2026-07-06-emojigram.md
```

- [ ] **Step 7: Full verification**

Run: `npm test && npm run build && npm run e2e`
Expected: everything green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add Playwright E2E smoke test and README"
```

---

## Plan Self-Review Notes

- **Spec coverage:** welcome/rooms/chat screens (Tasks 11–13), text-in/emoji-at-display flow (Tasks 9–10), hybrid translation + fallback rules (Task 5), pass-through of already-emoji messages (Task 5, persisted by Task 10), SSE + presence + reconnect refetch (Tasks 7, 9, 13), rate limit + 500-char cap (Tasks 6, 9), guest identity (Task 11), seeded rooms (Task 2), Vitest unit/API tests (Tasks 3–10), Playwright two-context smoke test (Task 14). Deployment to Vercel is a spec goal but intentionally out of scope for this plan (requires a Postgres switch + account setup — a separate follow-up task with the user).
- **Known simplifications (documented in code):** presence keyed by userId (two tabs = one member); SSE hub is in-memory/single-process (fine for dev and single-instance deploys; Vercel serverless would need a different realtime transport — flagged for the deployment follow-up); mixed text+emoji input goes through the normal Claude path (prompt says convey the whole message) rather than a special splice.
- **Type consistency check:** `RoomEvent`/`BroadcastMessage`/`PresenceMember` defined once in `lib/sse.ts` and imported everywhere; `Translation`/`ClaudeCaller` from `lib/translate.ts`; `Identity` from `lib/identity.ts`; `ChatMessage` from `hooks/useRoomStream.ts`; `RoomSummary` from `components/RoomCard.tsx`. Route param type `{ params: Promise<{ id: string }> }` used consistently (Next 15).


