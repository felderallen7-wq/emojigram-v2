// Fixed phrase → emoji overrides, checked before the translation pipeline so
// specific phrases always render as a chosen sequence instead of going to
// Claude or the word dictionary. Add a mapping by adding one line below.
// Matching is case-, apostrophe-, and whitespace-insensitive and happens on
// whole-word boundaries (so "67" fires on a standalone 67 but not inside
// 1967), with the first entry found in the message winning — list more
// specific phrases first. Each `match` must start and end with a word
// character (letter or digit) for the word-boundary check to work.
export const PHRASE_OVERRIDES: { match: string; emoji: string }[] = [
  { match: "don't like you", emoji: '🎈📌💥' },
  { match: 'clock that tea', emoji: '🕰️👉☕' },
  { match: '67', emoji: '6🫲🤪🫱7' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '') // treat don't / don’t / dont alike
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Precompile each phrase to a word-boundary regex once at module load.
const COMPILED = PHRASE_OVERRIDES.map(({ match, emoji }) => ({
  pattern: new RegExp(`\\b${escapeRegExp(normalize(match))}\\b`),
  emoji,
}));

export function phraseOverride(text: string): string | null {
  const normalized = normalize(text);
  for (const { pattern, emoji } of COMPILED) {
    if (pattern.test(normalized)) return emoji;
  }
  return null;
}
