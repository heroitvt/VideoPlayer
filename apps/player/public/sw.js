const CACHE_NAME = 'lg-signage-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept video stream requests for Stream-While-Cache
  if (url.pathname.includes('/api/videos/') && url.pathname.endsWith('/stream')) {
    event.respondWith(handleVideoStream(event.request));
  }
});

async function handleVideoStream(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request.url);

  if (cachedResponse) {
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const arrayBuffer = await cachedResponse.arrayBuffer();
      const bytes = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(bytes[0], 10);
      const end = bytes[1] ? parseInt(bytes[1], 10) : arrayBuffer.byteLength - 1;
      const sliced = arrayBuffer.slice(start, end + 1);

      return new Response(sliced, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(sliced.byteLength),
          'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
          'Accept-Ranges': 'bytes',
          'X-Cache-Hit': 'TRUE'
        }
      });
    }
    return cachedResponse;
  }

  // Stream from network while caching full copy in background
  const networkResponse = await fetch(request);
  if (networkResponse.ok && networkResponse.status === 200) {
    const cloned = networkResponse.clone();
    cache.put(request.url, cloned).catch(() => {});
  }
  return networkResponse;
}
