import { ManifestVideo, isVideoPlayable, isVideoExpired } from '@signage/shared';

export interface SchedulerOptions {
  getServerTime: () => Date;
  onVideoExpired?: (video: ManifestVideo) => void;
}

export class VideoScheduler {
  private getServerTime: () => Date;
  private onVideoExpired?: (video: ManifestVideo) => void;

  constructor(options: SchedulerOptions) {
    this.getServerTime = options.getServerTime;
    this.onVideoExpired = options.onVideoExpired;
  }

  isPlayable(video: ManifestVideo): boolean {
    const now = this.getServerTime();
    return isVideoPlayable({
      enabled: video.enabled,
      startsAt: video.startsAt,
      expiresAt: video.expiresAt,
      now
    });
  }

  checkExpiration(video: ManifestVideo): boolean {
    const now = this.getServerTime();
    const expired = isVideoExpired(video.expiresAt, now);
    if (expired && this.onVideoExpired) {
      this.onVideoExpired(video);
    }
    return expired;
  }
}
