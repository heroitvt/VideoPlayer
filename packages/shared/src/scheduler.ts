export interface PlayableCheckOptions {
  enabled: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  now?: Date | string;
}

export function isVideoPlayable({ enabled, startsAt, expiresAt, now = new Date() }: PlayableCheckOptions): boolean {
  if (!enabled) return false;

  const currentMs = typeof now === 'string' ? new Date(now).getTime() : now.getTime();

  if (startsAt !== null) {
    const startsMs = new Date(startsAt).getTime();
    if (isNaN(startsMs) || currentMs < startsMs) {
      return false;
    }
  }

  if (expiresAt !== null) {
    const expiresMs = new Date(expiresAt).getTime();
    if (isNaN(expiresMs) || currentMs >= expiresMs) {
      return false;
    }
  }

  return true;
}

export function isVideoExpired(expiresAt: string | null, now: Date | string = new Date()): boolean {
  if (expiresAt === null) return false;
  const currentMs = typeof now === 'string' ? new Date(now).getTime() : now.getTime();
  const expiresMs = new Date(expiresAt).getTime();
  return !isNaN(expiresMs) && currentMs >= expiresMs;
}
