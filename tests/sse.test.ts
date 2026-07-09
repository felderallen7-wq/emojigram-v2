import { describe, expect, it, vi } from 'vitest';
import { broadcast, join, memberCount, presenceMembers, type RoomEvent } from '@/lib/sse';

const member = (id: string) => ({ userId: id, displayName: id, avatarEmoji: '🦖' });

describe('sse hub', () => {
  it('delivers broadcasts to subscribers in the same room only', async () => {
    const gotA: RoomEvent[] = [];
    const gotB: RoomEvent[] = [];
    const leaveA = await join('room-a', member('a1'), (e) => gotA.push(e));
    const leaveB = await join('room-b', member('b1'), (e) => gotB.push(e));

    const event: RoomEvent = {
      type: 'message',
      message: {
        id: 'm1', roomId: 'room-a', userId: 'a1', displayName: 'a1',
        avatarEmoji: '🦖', originalText: 'hi', createdAt: new Date().toISOString(),
      },
    };
    await broadcast('room-a', event);

    expect(gotA).toContainEqual(event);
    expect(gotB.some((e) => e.type === 'message')).toBe(false);
    await leaveA(); await leaveB();
  });

  it('tracks presence on join and leave, broadcasting updates', async () => {
    const got: RoomEvent[] = [];
    const leave1 = await join('room-p', member('p1'), (e) => got.push(e));
    expect(await memberCount('room-p')).toBe(1);

    const leave2 = await join('room-p', member('p2'), () => {});
    expect(await memberCount('room-p')).toBe(2);
    expect((await presenceMembers('room-p')).map((m) => m.userId).sort()).toEqual(['p1', 'p2']);
    // p1 heard about p2 joining
    expect(got.filter((e) => e.type === 'presence').length).toBeGreaterThanOrEqual(2);

    await leave2();
    expect(await memberCount('room-p')).toBe(1);
    await leave1();
    expect(await memberCount('room-p')).toBe(0);
  });

  it('stops delivering after leave', async () => {
    const fn = vi.fn();
    const leave = await join('room-x', member('x1'), fn);
    await leave();
    fn.mockClear();
    await broadcast('room-x', { type: 'presence', members: [] });
    expect(fn).not.toHaveBeenCalled();
  });

  it('survives a subscriber that throws', async () => {
    const bad = await join('room-t', member('t-bad'), () => { throw new Error('dead client'); });
    const fn = vi.fn();
    const good = await join('room-t', member('t-good'), fn);
    await expect(broadcast('room-t', { type: 'presence', members: [] })).resolves.not.toThrow();
    expect(fn).toHaveBeenCalled();
    await bad(); await good();
  });
});
