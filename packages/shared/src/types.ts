export type ExpiryPolicy = 'IMMEDIATE' | 'FINISH_CURRENT';
export type CacheStatus = 'DOWNLOADING' | 'PARTIAL' | 'COMPLETE' | 'CORRUPTED';
export type DeviceStatus = 'ONLINE' | 'OFFLINE';

export interface VideoCacheIdentity {
  videoId: string;
  version: string;
  cacheKey: string;
  checksum: string;
}

export interface CacheEntry extends VideoCacheIdentity {
  status: CacheStatus;
  downloadedBytes: number;
  totalBytes: number;
  lastAccessedAt: number;
  cachedAt: number;
  refCount: number;
}

export interface ManifestVideo {
  videoId: string;
  version: string;
  cacheKey: string;
  title: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  checksum: string;
  startsAt: string | null; // ISO UTC
  expiresAt: string | null; // ISO UTC
  enabled: boolean;
  priority: number;
  expiryPolicy: ExpiryPolicy;
}

export interface PlaylistManifest {
  playlistId: string;
  version: number;
  timezone: string;
  checksum: string;
  generatedAt: string;
  videos: ManifestVideo[];
}

export interface DevicePairingRequest {
  tempDeviceId: string;
  name?: string;
  webosVersion?: string;
}

export interface DeviceHeartbeat {
  currentVideoId?: string;
  syncedPlaylistVersion?: number;
  cacheSummary?: {
    cachedVideosCount: number;
    totalCachedBytes: number;
  };
}
