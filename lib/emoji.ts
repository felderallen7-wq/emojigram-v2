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
