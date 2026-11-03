import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('ADMIN'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull()
});

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  currentVersion: integer('current_version').notNull().default(1),
  loopInfinite: integer('loop_infinite').notNull().default(1),
  isPublished: integer('is_published').notNull().default(0),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  currentVersion: text('current_version').notNull().default('v1'),
  r2Key: text('r2_key').notNull(),
  thumbnailKey: text('thumbnail_key'),
  mimeType: text('mime_type').notNull().default('video/mp4'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  checksum: text('checksum').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const videoVersions = sqliteTable(
  'video_versions',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    r2Key: text('r2_key').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    checksum: text('checksum').notNull(),
    createdAt: text('created_at').notNull()
  },
  (t) => ({
    videoVersionUnique: uniqueIndex('idx_video_version_unique').on(t.videoId, t.version)
  })
);

export const playlistItems = sqliteTable('playlist_items', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'restrict' }),
  videoVersion: text('video_version').notNull().default('v1'),
  sortOrder: integer('sort_order').notNull().default(0),
  enabled: integer('enabled').notNull().default(1),
  priority: integer('priority').notNull().default(0),
  startsAt: text('starts_at'),
  expiresAt: text('expires_at'),
  expiryPolicy: text('expiry_policy').notNull().default('IMMEDIATE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  playlistItemId: text('playlist_item_id').notNull().references(() => playlistItems.id, { onDelete: 'cascade' }),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  startsAt: text('starts_at'),
  expiresAt: text('expires_at'),
  enabled: integer('enabled').notNull().default(1),
  priority: integer('priority').notNull().default(0),
  expiryPolicy: text('expiry_policy').notNull().default('IMMEDIATE'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const playlistVersions = sqliteTable(
  'playlist_versions',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    manifestJson: text('manifest_json').notNull(),
    checksum: text('checksum').notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull()
  },
  (t) => ({
    playlistVersionUnique: uniqueIndex('idx_playlist_version_unique').on(t.playlistId, t.version)
  })
);

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  deviceTokenHash: text('device_token_hash').notNull().unique(),
  assignedPlaylistId: text('assigned_playlist_id').references(() => playlists.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('OFFLINE'),
  currentVideoId: text('current_video_id'),
  syncedPlaylistVersion: integer('synced_playlist_version').default(0),
  lastSyncAt: text('last_sync_at'),
  lastHeartbeatAt: text('last_heartbeat_at'),
  cacheSummaryJson: text('cache_summary_json'),
  webosVersion: text('webos_version'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const devicePairingCodes = sqliteTable('device_pairing_codes', {
  code: text('code').primaryKey(),
  deviceTempId: text('device_temp_id').notNull(),
  deviceId: text('device_id'),
  deviceTokenPlain: text('device_token_plain'),
  status: text('status').notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull()
});

export const devicePlaylists = sqliteTable('device_playlists', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  assignedAt: text('assigned_at').notNull()
});

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  playlistVersion: integer('playlist_version').notNull(),
  action: text('action').notNull().default('PUBLISH'),
  status: text('status').notNull().default('SUCCESS'),
  deployedBy: text('deployed_by'),
  createdAt: text('created_at').notNull()
});

export const deviceSyncLogs = sqliteTable('device_sync_logs', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  playlistVersion: integer('playlist_version'),
  eventType: text('event_type').notNull(),
  message: text('message'),
  detailsJson: text('details_json'),
  createdAt: text('created_at').notNull()
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull()
});
