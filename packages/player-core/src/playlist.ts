import { ManifestVideo, PlaylistManifest } from '@signage/shared';
import { VideoScheduler } from './scheduler';
import { VideoCacheManager } from '@signage/cache-manager';

export class PlaylistManager {
  private manifest: PlaylistManifest | null = null;
  private currentIndex = -1;
  private scheduler: VideoScheduler;
  private cacheManager: VideoCacheManager;
  private brokenVideoKeys = new Set<string>();

  constructor(scheduler: VideoScheduler, cacheManager: VideoCacheManager) {
    this.scheduler = scheduler;
    this.cacheManager = cacheManager;
  }

  setManifest(manifest: PlaylistManifest): void {
    this.manifest = manifest;
    this.brokenVideoKeys.clear();
    this.cacheManager.registerReferences(manifest.videos);
  }

  getManifest(): PlaylistManifest | null {
    return this.manifest;
  }

  markVideoBroken(cacheKey: string): void {
    this.brokenVideoKeys.add(cacheKey);
  }

  async getNextPlayableVideo(isOnline: boolean): Promise<ManifestVideo | null> {
    if (!this.manifest || this.manifest.videos.length === 0) {
      return null;
    }

    const total = this.manifest.videos.length;
    for (let i = 0; i < total; i++) {
      this.currentIndex = (this.currentIndex + 1) % total;
      const candidate = this.manifest.videos[this.currentIndex];

      // Check expiration first to trigger targeted cache cleanup
      if (this.scheduler.checkExpiration(candidate)) {
        await this.cacheManager.evictExpiredVideo(candidate.cacheKey, true);
        continue;
      }

      if (this.brokenVideoKeys.has(candidate.cacheKey)) {
        continue;
      }

      if (!this.scheduler.isPlayable(candidate)) {
        continue;
      }

      if (!isOnline) {
        const cached = await this.cacheManager.isCached(candidate.cacheKey);
        if (!cached) {
          continue;
        }
      }

      return candidate;
    }

    return null;
  }
}
