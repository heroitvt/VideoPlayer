# Cache Design & Safety Specification

## Data Structures

```typescript
export type CacheStatus = 'DOWNLOADING' | 'PARTIAL' | 'COMPLETE' | 'CORRUPTED';

export interface CacheEntry {
  videoId: string;
  version: string;
  cacheKey: string;
  checksum: string; // SHA-256
  status: CacheStatus;
  downloadedBytes: number;
  totalBytes: number;
  lastAccessedAt: number;
  cachedAt: number;
  refCount: number; // tracks playlists referencing this file
}
```

## Safety Guarantees
1. Atomic Entry Eviction:
   Target `cacheKey` deleted strictly via key lookup.
2. Reference Counting:
   If Playlist A and Playlist B both reference `cacheKey`, expiring Video A in Playlist A does not evict `cacheKey` until all references reach zero.
3. R2 Immutability:
   Expiration events on client NEVER send a `DELETE` request to Cloudflare R2.
