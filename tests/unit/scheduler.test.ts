import { describe, it, expect } from 'vitest';
import { isVideoPlayable, isVideoExpired, formatVietnamTime } from '../../packages/shared/src';

describe('Video Scheduler & Timezone Logic', () => {
  it('Evaluates active videos correctly based on startsAt and expiresAt', () => {
    const fixedNow = new Date('2026-11-03T12:00:00.000Z');

    // Video without dates -> always playable
    expect(
      isVideoPlayable({
        enabled: true,
        startsAt: null,
        expiresAt: null,
        now: fixedNow
      })
    ).toBe(true);

    // Disabled video -> not playable
    expect(
      isVideoPlayable({
        enabled: false,
        startsAt: null,
        expiresAt: null,
        now: fixedNow
      })
    ).toBe(false);

    // Video starting in future -> not playable yet
    expect(
      isVideoPlayable({
        enabled: true,
        startsAt: '2026-11-03T13:00:00.000Z',
        expiresAt: null,
        now: fixedNow
      })
    ).toBe(false);

    // Video expired in past -> not playable and expired = true
    expect(
      isVideoPlayable({
        enabled: true,
        startsAt: null,
        expiresAt: '2026-11-03T11:00:00.000Z',
        now: fixedNow
      })
    ).toBe(false);

    expect(isVideoExpired('2026-11-03T11:00:00.000Z', fixedNow)).toBe(true);
    expect(isVideoExpired('2026-11-03T13:00:00.000Z', fixedNow)).toBe(false);
  });

  it('Formats Vietnam Timezone (Asia/Ho_Chi_Minh) accurately', () => {
    // 2026-11-03 00:00:00 UTC should be 07:00:00 AM in Vietnam (+07:00)
    const formatted = formatVietnamTime('2026-11-03T00:00:00.000Z');
    expect(formatted).toContain('07:00:00');
    expect(formatted).toContain('03/11/2026');
  });
});
