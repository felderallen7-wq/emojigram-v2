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
