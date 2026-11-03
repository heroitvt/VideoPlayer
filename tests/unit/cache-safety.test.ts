import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCacheAdapter, VideoCacheManager } from '../../packages/cache-manager/src';
import { ManifestVideo } from '../../packages/shared/src';

describe('Critical Cache Safety Specification', () => {
  let adapter: MemoryCacheAdapter;
  let cacheManager: VideoCacheManager;

  const makeMockVideo = (id: string, cacheKey: string, expiresAt: string | null = null): ManifestVideo => ({
    videoId: id,
    version: 'v1',
    cacheKey,
    title: `Video ${id}`,
    url: `https://signage.local/videos/${id}.mp4`,
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    durationSeconds: 30,
    checksum: 'mock_checksum',
    startsAt: null,
    expiresAt,
    enabled: true,
    priority: 0,
    expiryPolicy: 'IMMEDIATE'
  });

  beforeEach(() => {
    adapter = new MemoryCacheAdapter();
    cacheManager = new VideoCacheManager({ adapter, verifyChecksum: false });
  });

  it('Evicts strictly expired video A while keeping B, C, D 100% intact', async () => {
    const videoA = makeMockVideo('A', 'video-A', '2026-01-01T00:00:00.000Z'); // Expired
    const videoB = makeMockVideo('B', 'video-B', '2099-01-01T00:00:00.000Z'); // Active
    const videoC = makeMockVideo('C', 'video-C', '2099-01-01T00:00:00.000Z'); // Active
    const videoD = makeMockVideo('D', 'video-D', null); // Active (No expiry)

    // Register references
    cacheManager.registerReferences([videoA, videoB, videoC, videoD]);

    // Populate cache for all 4 videos
    const buffer = new ArrayBuffer(512);
    await adapter.put(videoA.cacheKey, buffer);
    await adapter.put(videoB.cacheKey, buffer);
    await adapter.put(videoC.cacheKey, buffer);
    await adapter.put(videoD.cacheKey, buffer);

    // Mark as COMPLETE in registry
    for (const key of [videoA.cacheKey, videoB.cacheKey, videoC.cacheKey, videoD.cacheKey]) {
      const entry = cacheManager.getRegistryEntry(key);
      if (entry) {
        entry.status = 'COMPLETE';
      }
    }

    // Verify initial cache status
    expect(await cacheManager.isCached('video-A')).toBe(true);
    expect(await cacheManager.isCached('video-B')).toBe(true);
    expect(await cacheManager.isCached('video-C')).toBe(true);
    expect(await cacheManager.isCached('video-D')).toBe(true);

    // Video A expires -> Evict A
    const evictionResult = await cacheManager.evictExpiredVideo('video-A', true);
    expect(evictionResult.deleted).toBe(true);

    // Expected outcome:
    // A = DELETED
    expect(await cacheManager.isCached('video-A')).toBe(false);
    expect(await adapter.has('video-A')).toBe(false);

    // B = COMPLETE, C = COMPLETE, D = COMPLETE (untouched)
    expect(await cacheManager.isCached('video-B')).toBe(true);
    expect(await cacheManager.isCached('video-C')).toBe(true);
    expect(await cacheManager.isCached('video-D')).toBe(true);

    expect(await adapter.has('video-B')).toBe(true);
    expect(await adapter.has('video-C')).toBe(true);
    expect(await adapter.has('video-D')).toBe(true);
  });

  it('Maintains shared video cache if another playlist still references it', async () => {
    const videoA1 = makeMockVideo('shared-vid', 'shared-cache-key');
    const videoA2 = makeMockVideo('shared-vid', 'shared-cache-key');

    // Playlist 1 and Playlist 2 both register reference
    cacheManager.registerReferences([videoA1]);
    cacheManager.registerReferences([videoA2]);

    const entry = cacheManager.getRegistryEntry('shared-cache-key');
    expect(entry?.refCount).toBe(2);

    await adapter.put('shared-cache-key', new ArrayBuffer(256));
    entry!.status = 'COMPLETE';

    // Playlist 1 expires and removes its reference
    const res1 = await cacheManager.evictExpiredVideo('shared-cache-key', false);
    expect(res1.deleted).toBe(false);
    expect(res1.reason).toContain('STILL_REFERENCED');
    expect(await adapter.has('shared-cache-key')).toBe(true); // Still kept!

    // Playlist 2 also evicts -> refCount drops to 0, now evicted
    const res2 = await cacheManager.evictExpiredVideo('shared-cache-key', false);
    expect(res2.deleted).toBe(true);
    expect(await adapter.has('shared-cache-key')).toBe(false);
  });
});
