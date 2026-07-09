# Emojigram Phrase Overrides — Design Spec

**Date:** 2026-07-08
**Status:** Approved design, pending implementation
**Author:** Allen R. Felder (with Claude)

## Summary

Add a small table of exact phrase → fixed-emoji overrides, checked before
the translation pipeline, so specific phrases always render as a chosen
emoji sequence instead of being handled by Claude or the word dictionary.

## Motivation

On the deployed app (with an Anthropic API key set), whole-message
translation goes through Claude; the word dictionary is only a fallback and
a prompt hint. So there is currently no way to guarantee that a given phrase
produces a specific emoji sequence — Claude decides, and may paraphrase.
Phrase overrides give deterministic, author-controlled mappings for chosen
phrases while leaving everything else to the AI.

## Mappings (initial)

A message that **contains** the phrase (case-insensitive; apostrophe style
and extra whitespace ignored) maps to the emoji:

- `don't like you` → `🎈📌💥`
  (so "No I don't like you", "I don't like you romantically", "sorry, I
  don't like you" all match)
- `clock that tea` → `🕰️👉☕`

The list is ordered; the first phrase found in the message wins.

## Architecture

### New unit: `lib/phraseOverrides.ts`

- `PHRASE_OVERRIDES: { match: string; emoji: string }[]` — the ordered table
  above. Adding a mapping later is a one-line edit here.
- `phraseOverride(text: string): string | null` — normalizes the input
  (lowercase; strip `'` and `’`; collapse runs of whitespace to one space)
  and returns the `emoji` of the first entry whose (identically normalized)
  `match` is a substring of the normalized input, or `null` if none match.

### Integration: `lib/translate.ts`

In `translate(text, claudeCall?)`, after trimming, add the override check as
the **first** step — before the emoji-passthrough, the in-flight/result
cache, the API-key branch, and any Claude call:

```
const override = phraseOverride(trimmed);
if (override) return { emoji: override, fallback: false };
```

`fallback: false` means the result is treated as a real translation: the
`GET /api/messages/[id]/emoji` endpoint persists it to `Message.emojiText`
and displays it without the 🤖💤 marker. No Claude call is made for an
overridden phrase (free and deterministic). Non-matching messages are
unaffected and follow the existing pipeline exactly.

Rationale for placing overrides first: they must win over the emoji
passthrough and the cache so the mapping is guaranteed regardless of prior
state.

## Non-Goals

- No per-user or runtime-editable overrides (the table is baked into the
  code, applies to everyone — fits the shared demo).
- No change to the word dictionary or the Claude prompt.
- No fuzzy/semantic matching — substring on normalized text only.

## Testing

- `tests/phraseOverrides.test.ts` (unit): `phraseOverride` matches
  "No I don't like you", "I don't like you romantically", a curly-apostrophe
  variant, and mixed case → `🎈📌💥`; matches "clock that tea sis" →
  `🕰️👉☕`; returns `null` for a non-matching message; first-match ordering
  holds when a message could match two entries.
- `tests/translate.test.ts` (extend): a message containing an override
  phrase returns `{ emoji, fallback: false }` **without** invoking the
  injected `claudeCall` mock (assert it was not called), even with
  `ANTHROPIC_API_KEY` set.

## Shipping

Merges to `main`, which auto-deploys to the live Vercel URL. No
infrastructure or env-var changes.

## Decisions Log

- Match breadth: substring "contains" (case/apostrophe/whitespace-insensitive).
- `clock that tea` → `🕰️👉☕` only (the pinch 🤏🏻 option was dropped).
- `don't like you` uses the thumb-tack 📌 (U+1F4CC), not the round pushpin
  📍 (U+1F4CD, red with white center).
- Overrides are global (baked in), checked before the AI/cache for
  determinism.
