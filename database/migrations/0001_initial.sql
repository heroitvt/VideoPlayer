-- LG Video Signage - Cloudflare D1 Initial Schema (14 tables)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  loop_infinite INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  current_version TEXT NOT NULL DEFAULT 'v1',
  r2_key TEXT NOT NULL,
  thumbnail_key TEXT,
  mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_versions (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  UNIQUE(video_id, version)
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_version TEXT NOT NULL DEFAULT 'v1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  expires_at TEXT,
  expiry_policy TEXT NOT NULL DEFAULT 'IMMEDIATE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  playlist_item_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  expiry_policy TEXT NOT NULL DEFAULT 'IMMEDIATE',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (playlist_item_id) REFERENCES playlist_items(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playlist_versions (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, version)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_token_hash TEXT NOT NULL UNIQUE,
  assigned_playlist_id TEXT,
  status TEXT NOT NULL DEFAULT 'OFFLINE',
  current_video_id TEXT,
  synced_playlist_version INTEGER DEFAULT 0,
  last_sync_at TEXT,
  last_heartbeat_at TEXT,
  cache_summary_json TEXT,
  webos_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (assigned_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS device_pairing_codes (
  code TEXT PRIMARY KEY,
  device_temp_id TEXT NOT NULL,
  device_id TEXT,
  device_token_plain TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_playlists (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  UNIQUE(device_id, playlist_id)
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  playlist_version INTEGER NOT NULL,
  action TEXT NOT NULL DEFAULT 'PUBLISH',
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  deployed_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_sync_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  playlist_version INTEGER,
  event_type TEXT NOT NULL,
  message TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_playlist ON devices(assigned_playlist_id);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON device_pairing_codes(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_device ON device_sync_logs(device_id, created_at);
