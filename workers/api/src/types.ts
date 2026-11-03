export interface Env {
  DB: D1Database;
  VIDEO_BUCKET: R2Bucket;
  JWT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  TIMEZONE?: string;
}
