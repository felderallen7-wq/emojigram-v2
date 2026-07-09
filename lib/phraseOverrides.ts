// Fixed phrase → emoji overrides, checked before the translation pipeline so
// specific phrases always render as a chosen sequence instead of going to
// Claude or the word dictionary. Add a mapping by adding one line below.
// Matching is "contains", case-insensitive, apostrophe- and whitespace-
// agnostic; the first entry found in the message wins, so list more specific
// phrases first.
export const PHRASE_OVERRIDES: { match: string; emoji: string }[] = [
  { match: "don't like you", emoji: '🎈📌💥' },
  { match: 'clock that tea', emoji: '🕰️👉☕' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '') // treat don't / don’t / dont alike
    .replace(/\s+/g, ' ')
    .trim();
}

export function phraseOverride(text: string): string | null {
  const normalized = normalize(text);
  for (const { match, emoji } of PHRASE_OVERRIDES) {
    if (normalized.includes(normalize(match))) return emoji;
  }
  return null;
}
