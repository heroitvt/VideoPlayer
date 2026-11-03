import { ManifestVideo, PlaylistManifest } from '@signage/shared';
import { VideoCacheManager } from '@signage/cache-manager';
import { StateMachine, PlayerState } from './state-machine';
import { VideoScheduler } from './scheduler';
import { PlaylistManager } from './playlist';
import { NetworkMonitor } from './network';

export interface PlayerControllerOptions {
  cacheManager: VideoCacheManager;
  networkMonitor?: NetworkMonitor;
  getServerTime?: () => Date;
  onPlayVideo?: (video: ManifestVideo, playbackUrl: string, source: 'CACHE' | 'NETWORK') => void;
  onStandby?: () => void;
}

export class PlayerController {
  public readonly stateMachine = new StateMachine();
  public readonly scheduler: VideoScheduler;
  public readonly playlistManager: PlaylistManager;
  public readonly cacheManager: VideoCacheManager;
  public readonly networkMonitor: NetworkMonitor;

  private currentVideo: ManifestVideo | null = null;
  private currentCleanup?: () => void;
  private onPlayVideo?: (video: ManifestVideo, playbackUrl: string, source: 'CACHE' | 'NETWORK') => void;
  private onStandby?: () => void;

  constructor(options: PlayerControllerOptions) {
    this.cacheManager = options.cacheManager;
    this.networkMonitor = options.networkMonitor ?? new NetworkMonitor();
    this.onPlayVideo = options.onPlayVideo;
    this.onStandby = options.onStandby;

    this.scheduler = new VideoScheduler({
      getServerTime: options.getServerTime ?? (() => new Date())
    });

    this.playlistManager = new PlaylistManager(this.scheduler, this.cacheManager);

    this.networkMonitor.subscribe((online) => {
      if (!online && this.stateMachine.getState() !== 'PLAYING') {
        this.stateMachine.transition('OFFLINE');
      }
    });
  }

  getState(): PlayerState {
    return this.stateMachine.getState();
  }

  getCurrentVideo(): ManifestVideo | null {
    return this.currentVideo;
  }

  loadManifest(manifest: PlaylistManifest): void {
    this.stateMachine.transition('SYNCING');
    this.playlistManager.setManifest(manifest);
    this.stateMachine.transition('READY');
  }

  async playNext(): Promise<ManifestVideo | null> {
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = undefined;
    }

    // If previous video just finished and expired during FINISH_CURRENT policy, evict now
    if (this.currentVideo && this.scheduler.checkExpiration(this.currentVideo)) {
      await this.cacheManager.evictExpiredVideo(this.currentVideo.cacheKey, true);
    }

    const isOnline = this.networkMonitor.isOnline();
    const next = await this.playlistManager.getNextPlayableVideo(isOnline);

    if (!next) {
      this.currentVideo = null;
      this.stateMachine.transition(isOnline ? 'READY' : 'OFFLINE');
      this.onStandby?.();
      return null;
    }

    this.currentVideo = next;
    const { url, source, cleanup } = await this.cacheManager.getPlaybackUrl(next);
    this.currentCleanup = cleanup;
    this.stateMachine.transition('PLAYING', { video: next, source });
    this.onPlayVideo?.(next, url, source);
    return next;
  }

  async handleVideoEnded(): Promise<ManifestVideo | null> {
    return this.playNext();
  }

  async handleVideoError(): Promise<ManifestVideo | null> {
    if (this.currentVideo) {
      this.playlistManager.markVideoBroken(this.currentVideo.cacheKey);
    }
    this.stateMachine.transition('RECOVERING');
    return this.playNext();
  }

  async checkActiveVideoExpirationTick(): Promise<boolean> {
    if (!this.currentVideo) return false;
    const expired = this.scheduler.checkExpiration(this.currentVideo);
    if (!expired) return false;

    if (this.currentVideo.expiryPolicy === 'IMMEDIATE') {
      const expiredKey = this.currentVideo.cacheKey;
      await this.cacheManager.evictExpiredVideo(expiredKey, true);
      await this.playNext();
      return true;
    }
    // FINISH_CURRENT: let current play finish, will evict in playNext()
    return false;
  }
}
