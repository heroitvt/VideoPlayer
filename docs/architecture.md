# LG Video Signage - Architecture & Design

## 1. System Topology
- Cloudflare Pages: Hosts `apps/admin` (SPA) and `apps/player` (PWA/webOS browser client).
- Cloudflare Workers: Hono REST API (`workers/api`).
- Cloudflare D1: SQLite database for metadata, schedules, pairings, audit logs.
- Cloudflare R2: Video blob store. Direct signed URL or chunked proxy with Range (206) support.

## 2. Stream While Cache Mechanism
- WebOS 4.0+ runs Chromium 53+. Supports Service Worker, Cache API, and IndexedDB.
- TV initiates video stream via standard `<video src="/api/videos/:id/stream">`.
- Service Worker intercepts Range requests:
  - Cache hit: Serve full or sliced ArrayBuffer from local Cache Storage / IndexedDB.
  - Cache miss: Fetch from Cloudflare R2/Worker, pipe stream to `<video>`, simultaneously tee stream chunks into local cache store.
  - When 100% of chunks received and SHA-256 verified, mark status as `COMPLETE`.
  - Next playback: Plays 100% offline from local cache. Zero egress to R2.

## 3. Targeted Cache Deletion (Strict Rule)
- When video `expiresAt <= now`:
  1. Scheduler halts active playback if policy = `IMMEDIATE`, or waits for loop end if `FINISH_CURRENT`.
  2. Compute references: check if any active playlist still uses `cacheKey`.
  3. If references == 0:
     - Delete EXACT entry: `cache.delete(cacheKey)` and `indexedDB.delete(store, cacheKey)`.
     - Remove entry from local `CacheRegistry`.
     - DO NOT touch other cached video files.
     - DO NOT clear IndexedDB database or global Cache Storage bucket.
     - DO NOT delete original file on Cloudflare R2.
