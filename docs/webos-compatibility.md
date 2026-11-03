# LG webOS Compatibility Guide

## Target Platform
- Primary: webOS 4.0 - 24 (Chromium 53 to Chromium 108+).
- Fallback: Legacy browsers with IndexedDB Blob support.

## Web Capabilities Matrix
- HTML5 Video: MP4 (H.264 Baseline/Main/High Profile up to Level 4.2, AAC audio).
- Service Worker: webOS 4.5+ supports Service Worker for localhost and HTTPS.
- Storage Quota: webOS browser typically allows 500MB - 2GB per origin depending on model.
- Range Requests: Supported via Service Worker fetch interception or native `fetch(..., { headers: { Range: ... } })`.

## Diagnostics Route (`/diagnostics`)
Client validates:
1. User Agent & webOS version.
2. Codec `canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')`.
3. Service Worker registration.
4. Cache Storage write/read/delete.
5. IndexedDB persistent quota and blob storage.
6. Offline simulated playback.
