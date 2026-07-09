import { describe, expect, it } from 'vitest';
import { phraseOverride } from '@/lib/phraseOverrides';

describe('phraseOverride', () => {
  it('maps "don\'t like you" phrasings to the balloon/pin/boom sequence', () => {
    expect(phraseOverride('No I don\'t like you')).toBe('🎈📌💥');
    expect(phraseOverride('I don\'t like you romantically')).toBe('🎈📌💥');
    expect(phraseOverride('sorry, I don\'t like you!')).toBe('🎈📌💥');
  });

  it('ignores apostrophe style and letter case', () => {
    expect(phraseOverride('i DON’T LIKE YOU')).toBe('🎈📌💥'); // curly apostrophe + caps
  });

  it('maps "clock that tea" (as a substring) to clock/point/tea', () => {
    expect(phraseOverride('clock that tea sis')).toBe('🕰️👉☕');
  });

  it('returns null when no override phrase is present', () => {
    expect(phraseOverride('pizza tonight?')).toBeNull();
    expect(phraseOverride('i like you')).toBeNull();
  });

  it('returns the first matching phrase when more than one could match', () => {
    // "don't like you" is listed before "clock that tea"; a message with both
    // resolves to the first entry.
    expect(phraseOverride("clock that tea, but i don't like you")).toBe('🎈📌💥');
  });
});
