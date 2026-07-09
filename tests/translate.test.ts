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

  it('returns a phrase override without calling Claude, even with a key set', async () => {
    const claude = vi.fn();
    expect(await translate('No I don\'t like you', claude)).toEqual({
      emoji: '🎈📌💥',
      fallback: false,
    });
    expect(claude).not.toHaveBeenCalled();
  });

  it('coalesces concurrent calls for the same text into a single Claude call', async () => {
    const claude = vi.fn().mockImplementation(
      () => new Promise((r) => setTimeout(() => r('🍕'), 50)),
    );
    const [a, b] = await Promise.all([translate('pizza', claude), translate('pizza', claude)]);
    expect(claude).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ emoji: '🍕', fallback: false });
    expect(b).toEqual({ emoji: '🍕', fallback: false });
  });
});
