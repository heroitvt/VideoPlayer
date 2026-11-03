export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function formatVietnamTime(date: Date | string | number): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

export function toUtcIsoString(date: Date | string): string {
  return new Date(date).toISOString();
}
