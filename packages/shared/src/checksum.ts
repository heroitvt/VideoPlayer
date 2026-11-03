export async function computeSha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildCacheKey(videoId: string, version: string): string {
  return `${videoId}-${version}`;
}
