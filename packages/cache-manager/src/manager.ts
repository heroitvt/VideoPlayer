import { CacheAdapter } from './adapter';
import { CacheEntry, ManifestVideo } from '@signage/shared';
import { computeSha256Hex } from '@signage/shared';

export interface CacheManagerOptions {
  adapter: CacheAdapter;
  verifyChecksum?: boolean;
  disableCache?: boolean;
}

export class VideoCacheManager {
  private adapter: CacheAdapter;
  private verifyChecksum: boolean;
  private disableCache: boolean;
  private registry = new Map<string, CacheEntry>();
  private inFlightDownloads = new Map<string, Promise<void>>();

  constructor(options: CacheManagerOptions) {
    this.adapter = options.adapter;
    this.verifyChecksum = options.verifyChecksum ?? true;
    this.disableCache = options.disableCache ?? false;
  }

  getRegistryEntry(cacheKey: string): CacheEntry | undefined {
    return this.registry.get(cacheKey);
  }

  getAllRegistryEntries(): CacheEntry[] {
    return Array.from(this.registry.values());
  }

  registerReferences(videos: ManifestVideo[]): void {
    const activeKeysInPlaylist = new Set(videos.map((v) => v.cacheKey));

    for (const video of videos) {
      const existing = this.registry.get(video.cacheKey);
      if (existing) {
        existing.refCount += 1;
      } else {
        this.registry.set(video.cacheKey, {
          videoId: video.videoId,
          version: video.version,
          cacheKey: video.cacheKey,
          checksum: video.checksum,
          status: 'PARTIAL',
          downloadedBytes: 0,
          totalBytes: video.sizeBytes,
          lastAccessedAt: Date.now(),
          cachedAt: 0,
          refCount: 1
        });
      }
    }
  }

  async isCached(cacheKey: string): Promise<boolean> {
    const entry = this.registry.get(cacheKey);
    if (!entry || entry.status !== 'COMPLETE') {
      return false;
    }
    return this.adapter.has(cacheKey);
  }

  async getPlaybackUrl(video: ManifestVideo): Promise<{ url: string; source: 'CACHE' | 'NETWORK'; cleanup?: () => void }> {
    if (this.disableCache) {
      return {
        url: video.url,
        source: 'NETWORK'
      };
    }

    const cached = await this.isCached(video.cacheKey);
    if (cached) {
      const data = await this.adapter.get(video.cacheKey);
      if (data) {
        const entry = this.registry.get(video.cacheKey);
        if (entry) entry.lastAccessedAt = Date.now();

        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const blob = data instanceof Blob ? data : new Blob([data], { type: video.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          return {
            url: objectUrl,
            source: 'CACHE',
            cleanup: () => URL.revokeObjectURL(objectUrl)
          };
        }
      }
    }

    // Cache miss or streaming: return network URL and trigger background/stream cache
    this.triggerStreamWhileCache(video).catch(() => {});
    return {
      url: video.url,
      source: 'NETWORK'
    };
  }

  async triggerStreamWhileCache(
    video: ManifestVideo,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    const { cacheKey } = video;

    if (await this.isCached(cacheKey)) {
      return;
    }

    if (this.inFlightDownloads.has(cacheKey)) {
      return this.inFlightDownloads.get(cacheKey)!;
    }

    const downloadTask = (async () => {
      try {
        let entry = this.registry.get(cacheKey);
        if (!entry) {
          entry = {
            videoId: video.videoId,
            version: video.version,
            cacheKey: video.cacheKey,
            checksum: video.checksum,
            status: 'DOWNLOADING',
            downloadedBytes: 0,
            totalBytes: video.sizeBytes,
            lastAccessedAt: Date.now(),
            cachedAt: 0,
            refCount: 1
          };
          this.registry.set(cacheKey, entry);
        } else {
          entry.status = 'DOWNLOADING';
        }

        const response = await fetch(video.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        entry.downloadedBytes = buffer.byteLength;
        onProgress?.(buffer.byteLength, video.sizeBytes);

        if (this.verifyChecksum && video.checksum) {
          if (video.checksum.startsWith('size:')) {
            if (video.sizeBytes > 0 && buffer.byteLength !== video.sizeBytes) {
              entry.status = 'CORRUPTED';
              throw new Error(`Size mismatch for ${cacheKey}. Expected ${video.sizeBytes}, got ${buffer.byteLength}`);
            }
          } else {
            const computed = await computeSha256Hex(buffer);
            if (computed.toLowerCase() !== video.checksum.toLowerCase()) {
              entry.status = 'CORRUPTED';
              throw new Error(`Checksum mismatch for ${cacheKey}. Expected ${video.checksum}, got ${computed}`);
            }
          }
        }

        await this.adapter.put(cacheKey, buffer);
        entry.status = 'COMPLETE';
        entry.cachedAt = Date.now();
        entry.lastAccessedAt = Date.now();
      } catch (err) {
        const entry = this.registry.get(cacheKey);
        if (entry && entry.status !== 'COMPLETE') {
          entry.status = 'CORRUPTED';
        }
        throw err;
      } finally {
        this.inFlightDownloads.delete(cacheKey);
      }
    })();

    this.inFlightDownloads.set(cacheKey, downloadTask);
    return downloadTask;
  }

  /**
   * CRITICAL SAFETY RULE:
   * Evicts strictly ONE single expired video entry.
   * Absolutely NO global or multi-item deletions.
   */
  async evictExpiredVideo(cacheKey: string, force = false): Promise<{ deleted: boolean; reason: string }> {
    const entry = this.registry.get(cacheKey);
    if (!entry) {
      return { deleted: false, reason: 'NOT_FOUND_IN_REGISTRY' };
    }

    if (!force) {
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (entry.refCount > 0) {
        return {
          deleted: false,
          reason: `STILL_REFERENCED_BY_${entry.refCount}_PLAYLISTS`
        };
      }
    }

    // Cancel in-flight download if active
    this.inFlightDownloads.delete(cacheKey);

    // Targeted deletion of single item only
    const adapterDeleted = await this.adapter.delete(cacheKey);
    this.registry.delete(cacheKey);

    return {
      deleted: adapterDeleted,
      reason: 'EVICTED_SUCCESSFULLY'
    };
  }
}
