import { describe, it, expect } from 'vitest';
import { MemoryCacheAdapter, VideoCacheManager } from '../../packages/cache-manager/src';
import { PlayerController } from '../../packages/player-core/src';
import { PlaylistManifest } from '../../packages/shared/src';

describe('Player Controller & Continuous Playback Loop', () => {
  it('Loops through valid videos infinitely and skips broken or expired ones', async () => {
    const adapter = new MemoryCacheAdapter();
    const cacheManager = new VideoCacheManager({ adapter, verifyChecksum: false });

    let currentPlayedId = '';
    const controller = new PlayerController({
      cacheManager,
      getServerTime: () => new Date('2026-11-03T10:00:00.000Z'),
      onPlayVideo: (video) => {
        currentPlayedId = video.videoId;
      }
    });

    const manifest: PlaylistManifest = {
      playlistId: 'pl-loop',
      version: 1,
      timezone: 'Asia/Ho_Chi_Minh',
      checksum: 'chk_loop',
      generatedAt: '2026-11-03T10:00:00.000Z',
      videos: [
        {
          videoId: 'v1',
          version: 'v1',
          cacheKey: 'v1-v1',
          title: 'Video 1',
          url: 'https://test.local/v1.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          durationSeconds: 10,
          checksum: 'chk1',
          startsAt: null,
          expiresAt: null,
          enabled: true,
          priority: 0,
          expiryPolicy: 'IMMEDIATE'
        },
        {
          videoId: 'v2',
          version: 'v1',
          cacheKey: 'v2-v1',
          title: 'Video 2 (Disabled)',
          url: 'https://test.local/v2.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          durationSeconds: 10,
          checksum: 'chk2',
          startsAt: null,
          expiresAt: null,
          enabled: false, // Disabled
          priority: 0,
          expiryPolicy: 'IMMEDIATE'
        },
        {
          videoId: 'v3',
          version: 'v1',
          cacheKey: 'v3-v1',
          title: 'Video 3',
          url: 'https://test.local/v3.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          durationSeconds: 10,
          checksum: 'chk3',
          startsAt: null,
          expiresAt: null,
          enabled: true,
          priority: 0,
          expiryPolicy: 'IMMEDIATE'
        }
      ]
    };

    controller.loadManifest(manifest);

    // First playback -> v1
    await controller.playNext();
    expect(currentPlayedId).toBe('v1');
    expect(controller.getState()).toBe('PLAYING');

    // Video ended -> skips v2 (disabled) -> plays v3
    await controller.handleVideoEnded();
    expect(currentPlayedId).toBe('v3');

    // Video ended -> loops back to v1
    await controller.handleVideoEnded();
    expect(currentPlayedId).toBe('v1');
  });

  it('Plays only cached videos when TV is offline', async () => {
    const adapter = new MemoryCacheAdapter();
    const cacheManager = new VideoCacheManager({ adapter, verifyChecksum: false });

    let currentPlayedId = '';
    const controller = new PlayerController({
      cacheManager,
      getServerTime: () => new Date('2026-11-03T10:00:00.000Z'),
      onPlayVideo: (video) => {
        currentPlayedId = video.videoId;
      }
    });

    const manifest: PlaylistManifest = {
      playlistId: 'pl-offline',
      version: 1,
      timezone: 'Asia/Ho_Chi_Minh',
      checksum: 'chk_offline',
      generatedAt: '2026-11-03T10:00:00.000Z',
      videos: [
        {
          videoId: 'v-uncached',
          version: 'v1',
          cacheKey: 'v-uncached-v1',
          title: 'Uncached Video',
          url: 'https://test.local/uncached.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          durationSeconds: 10,
          checksum: 'chk1',
          startsAt: null,
          expiresAt: null,
          enabled: true,
          priority: 0,
          expiryPolicy: 'IMMEDIATE'
        },
        {
          videoId: 'v-cached',
          version: 'v1',
          cacheKey: 'v-cached-v1',
          title: 'Cached Video',
          url: 'https://test.local/cached.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 100,
          durationSeconds: 10,
          checksum: 'chk2',
          startsAt: null,
          expiresAt: null,
          enabled: true,
          priority: 0,
          expiryPolicy: 'IMMEDIATE'
        }
      ]
    };

    // Populate cache ONLY for v-cached
    await adapter.put('v-cached-v1', new ArrayBuffer(100));
    controller.loadManifest(manifest);

    const cachedEntry = cacheManager.getRegistryEntry('v-cached-v1');
    if (cachedEntry) cachedEntry.status = 'COMPLETE';

    // Simulate Network Disconnected
    controller.networkMonitor.setOnline(false);

    // Playback should automatically skip v-uncached and choose v-cached
    await controller.playNext();
    expect(currentPlayedId).toBe('v-cached');
  });
});
