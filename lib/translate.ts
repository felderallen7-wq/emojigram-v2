import Anthropic from '@anthropic-ai/sdk';
import { dictionaryHints, dictionaryTranslate } from './dictionary';
import { extractEmoji, isEmojiOnly } from './emoji';
import { phraseOverride } from './phraseOverrides';

export type Translation = { emoji: string; fallback: boolean };
export type ClaudeCaller = (text: string, hints: string) => Promise<string>;

const SYSTEM_PROMPT = `You translate short chat messages into emoji sequences.
Rules:
- Respond with ONLY emoji characters. No words, letters, digits, or punctuation.
- Convey the meaning and tone of the whole message, in reading order.
- Use 1-12 emoji. Prefer a few expressive emoji over many literal ones.
- If the message already contains emoji, keep those emoji in your output, in their original order.
- Always produce something, even for nonsense input.`;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<Translation>>();

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
  inflight.clear();
}

export async function translate(
  text: string,
  claudeCall: ClaudeCaller = callClaude,
): Promise<Translation> {
  const trimmed = text.trim();

  // Fixed phrase overrides win over everything (passthrough, cache, Claude):
  // deterministic, no API call.
  const override = phraseOverride(trimmed);
  if (override) return { emoji: override, fallback: false };

  if (isEmojiOnly(trimmed)) return { emoji: trimmed, fallback: false };

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached) return { emoji: cached, fallback: false };

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<Translation> => {
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
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
