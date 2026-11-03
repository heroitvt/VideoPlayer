export interface CacheAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  has(cacheKey: string): Promise<boolean>;
  get(cacheKey: string): Promise<ArrayBuffer | Blob | null>;
  put(cacheKey: string, data: ArrayBuffer | Blob): Promise<void>;
  delete(cacheKey: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

export class MemoryCacheAdapter implements CacheAdapter {
  name = 'MemoryCacheAdapter';
  private store = new Map<string, ArrayBuffer>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async has(cacheKey: string): Promise<boolean> {
    return this.store.has(cacheKey);
  }

  async get(cacheKey: string): Promise<ArrayBuffer | null> {
    const data = this.store.get(cacheKey);
    return data ? data.slice(0) : null;
  }

  async put(cacheKey: string, data: ArrayBuffer | Blob): Promise<void> {
    let buffer: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (typeof (data as Blob).arrayBuffer === 'function') {
      buffer = await (data as Blob).arrayBuffer();
    } else {
      buffer = new ArrayBuffer(0);
    }
    this.store.set(cacheKey, buffer);
  }

  async delete(cacheKey: string): Promise<boolean> {
    return this.store.delete(cacheKey);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

export class CacheStorageAdapter implements CacheAdapter {
  name = 'CacheStorageAdapter';
  private cacheName: string;

  constructor(cacheName = 'lg-signage-v1') {
    this.cacheName = cacheName;
  }

  async isAvailable(): Promise<boolean> {
    return typeof caches !== 'undefined';
  }

  private async getCache(): Promise<Cache> {
    return caches.open(this.cacheName);
  }

  private makeUrl(cacheKey: string): string {
    return `https://cache.local/videos/${encodeURIComponent(cacheKey)}`;
  }

  async has(cacheKey: string): Promise<boolean> {
    if (!await this.isAvailable()) return false;
    const cache = await this.getCache();
    const res = await cache.match(this.makeUrl(cacheKey));
    return Boolean(res);
  }

  async get(cacheKey: string): Promise<ArrayBuffer | null> {
    if (!await this.isAvailable()) return null;
    const cache = await this.getCache();
    const res = await cache.match(this.makeUrl(cacheKey));
    if (!res) return null;
    return res.arrayBuffer();
  }

  async put(cacheKey: string, data: ArrayBuffer | Blob): Promise<void> {
    if (!await this.isAvailable()) throw new Error('CacheStorage not available');
    const cache = await this.getCache();
    const size = data instanceof ArrayBuffer ? data.byteLength : (data as Blob).size || 0;
    const response = new Response(data, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(size),
        'X-Signage-Cache-Key': cacheKey
      }
    });
    await cache.put(this.makeUrl(cacheKey), response);
  }

  async delete(cacheKey: string): Promise<boolean> {
    if (!await this.isAvailable()) return false;
    const cache = await this.getCache();
    return cache.delete(this.makeUrl(cacheKey));
  }

  async keys(): Promise<string[]> {
    if (!await this.isAvailable()) return [];
    const cache = await this.getCache();
    const requests = await cache.keys();
    return requests.map((r) => {
      const parts = r.url.split('/');
      return decodeURIComponent(parts[parts.length - 1]);
    });
  }
}
