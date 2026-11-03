import { PlaylistManifest, PlaylistManifestSchema } from '@signage/shared';

export interface SyncManagerOptions {
  apiBaseUrl: string;
  deviceId?: string;
  deviceToken?: string;
  playlistId?: string;
  pollIntervalMs?: number;
  onManifestUpdated?: (manifest: PlaylistManifest) => void;
}

const SNAPSHOT_STORAGE_KEY = 'lg_signage_manifest_snapshot_v1';

export class DeviceSyncManager {
  private options: SyncManagerOptions;
  private lastEtag: string | null = null;
  private currentManifest: PlaylistManifest | null = null;
  private clockOffsetMs = 0;
  private timer: any = null;

  constructor(options: SyncManagerOptions) {
    this.options = options;
    this.loadSnapshot();
  }

  private loadSnapshot(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const validated = PlaylistManifestSchema.safeParse(parsed);
          if (validated.success) {
            this.currentManifest = validated.data;
          }
        }
      }
    } catch {
      // Ignore corrupt local snapshot
    }
  }

  private saveSnapshot(manifest: PlaylistManifest): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(manifest));
      }
    } catch {
      // Ignore storage quota errors on snapshot save
    }
  }

  getServerNow(): Date {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  getCurrentManifest(): PlaylistManifest | null {
    return this.currentManifest;
  }

  async syncOnce(): Promise<{ updated: boolean; manifest: PlaylistManifest | null }> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (this.options.deviceToken) {
      headers['Authorization'] = `Bearer ${this.options.deviceToken}`;
    }
    if (this.lastEtag) {
      headers['If-None-Match'] = this.lastEtag;
    }

    try {
      let url = '';
      if (this.options.deviceId && this.options.deviceId !== 'public') {
        url = `${this.options.apiBaseUrl}/api/player/${encodeURIComponent(this.options.deviceId)}/manifest`;
      } else {
        const query = this.options.playlistId ? `?playlist=${encodeURIComponent(this.options.playlistId)}` : '';
        url = `${this.options.apiBaseUrl}/api/public/manifest${query}`;
      }
      const res = await fetch(url, { headers });

      const serverTimeHeader = res.headers.get('X-Server-Time');
      if (serverTimeHeader) {
        const serverMs = new Date(serverTimeHeader).getTime();
        if (!isNaN(serverMs)) {
          this.clockOffsetMs = serverMs - Date.now();
        }
      }

      if (res.status === 304 && this.currentManifest) {
        return { updated: false, manifest: this.currentManifest };
      }

      if (!res.ok) {
        return { updated: false, manifest: this.currentManifest };
      }

      const etag = res.headers.get('ETag');
      const data = await res.json();
      const parsed = PlaylistManifestSchema.safeParse(data);
      if (!parsed.success) {
        return { updated: false, manifest: this.currentManifest };
      }

      const changed =
        !this.currentManifest ||
        this.currentManifest.version !== parsed.data.version ||
        this.currentManifest.checksum !== parsed.data.checksum;

      this.currentManifest = parsed.data;
      if (etag) this.lastEtag = etag;
      this.saveSnapshot(parsed.data);

      if (changed && this.options.onManifestUpdated) {
        this.options.onManifestUpdated(parsed.data);
      }

      return { updated: changed, manifest: this.currentManifest };
    } catch {
      // Keep last known good manifest on network failure
      return { updated: false, manifest: this.currentManifest };
    }
  }

  startPolling(): void {
    this.stopPolling();
    const interval = this.options.pollIntervalMs ?? 45000;
    this.timer = setInterval(() => {
      this.syncOnce().catch(() => {});
    }, interval);
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
