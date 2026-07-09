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
  it('keeps existing emoji interleaved in reading order', () => {
    expect(dictionaryTranslate('pizza 🎉 tonight')).toBe('🍕🎉🌙');
  });
  it('preserves Ⓜ️ with mixed-case input', () => {
    expect(dictionaryTranslate('PIZZA Ⓜ️ tonight')).toBe('🍕Ⓜ️🌙');
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
