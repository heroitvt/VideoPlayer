import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { signJwt, verifyJwt } from './auth';
import { computeSha256Hex, buildCacheKey, PlaylistManifest } from '@signage/shared';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'If-None-Match', 'Range', 'x-upload-id', 'x-r2-key', 'x-part-number'],
    exposeHeaders: ['Content-Range', 'Accept-Ranges', 'ETag', 'X-Server-Time']
  })
);

// Admin Auth Middleware
const requireAdmin = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET || 'fallback_secret_for_local_testing_min_32_chars';
  const payload = await verifyJwt(token, secret);
  if (!payload || payload.role !== 'ADMIN') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  c.set('user', payload);
  await next();
};

// Helper function for password hashing & verification
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256$${salt}$${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string, fallbackPlain: string): Promise<boolean> {
  if (storedHash && storedHash.startsWith('sha256$')) {
    const parts = storedHash.split('$');
    const salt = parts[1];
    const computed = await hashPassword(password, salt);
    return computed === storedHash;
  }
  return password === fallbackPlain;
}

// --- AUTH ROUTES ---
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = body.username || '';
  const password = body.password || '';

  const configuredUser = c.env.ADMIN_USERNAME || 'admin';
  const configuredPass = c.env.ADMIN_PASSWORD || 'admin123';

  if (username !== configuredUser) {
    return c.json({ error: 'Sai tài khoản hoặc mật khẩu' }, 401);
  }

  let valid = false;
  const userRow = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<any>();

  if (userRow && userRow.password_hash) {
    valid = await verifyPassword(password, userRow.password_hash, configuredPass);
  } else {
    valid = password === configuredPass;
    if (valid) {
      const now = new Date().toISOString();
      const salt = Math.random().toString(36).substring(2, 10);
      const hash = await hashPassword(password, salt);
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO users (id, username, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, 'ADMIN', ?, ?)`
      )
        .bind(`usr_${username}`, username, hash, now, now)
        .run();
    }
  }

  if (!valid) {
    return c.json({ error: 'Sai tài khoản hoặc mật khẩu' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'fallback_secret_for_local_testing_min_32_chars';
  const token = await signJwt(
    {
      sub: 'admin-01',
      username,
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) + 7 * 86400 // 7 days
    },
    secret
  );

  return c.json({ token, user: { username, role: 'ADMIN' } });
});

app.post('/api/auth/change-password', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' }, 400);
  }

  const currentUser = c.get('user');
  const configuredPass = c.env.ADMIN_PASSWORD || 'admin123';

  const userRow = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?')
    .bind(currentUser.username)
    .first<any>();

  let isMatch = false;
  if (userRow && userRow.password_hash) {
    isMatch = await verifyPassword(currentPassword, userRow.password_hash, configuredPass);
  } else {
    isMatch = currentPassword === configuredPass;
  }

  if (!isMatch) {
    return c.json({ error: 'Mật khẩu hiện tại không chính xác' }, 400);
  }

  const salt = Math.random().toString(36).substring(2, 10);
  const newHash = await hashPassword(newPassword, salt);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO users (id, username, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, 'ADMIN', ?, ?)`
  )
    .bind(`usr_${currentUser.username}`, currentUser.username, newHash, now, now)
    .run();

  return c.json({ success: true, message: 'Đổi mật khẩu thành công' });
});

app.get('/api/auth/me', requireAdmin, async (c) => {
  return c.json({ user: c.get('user') });
});

// --- DASHBOARD STATS ---
app.get('/api/stats/dashboard', requireAdmin, async (c) => {
  const nowUtc = new Date().toISOString();

  const totalDevicesRes = await c.env.DB.prepare('SELECT count(*) as count FROM devices').first<any>();
  const onlineDevicesRes = await c.env.DB.prepare("SELECT count(*) as count FROM devices WHERE status = 'ONLINE'").first<any>();
  const totalVideosRes = await c.env.DB.prepare('SELECT count(*) as count, sum(size_bytes) as total_bytes FROM videos WHERE deleted_at IS NULL').first<any>();
  const playlistsRes = await c.env.DB.prepare('SELECT count(*) as count FROM playlists WHERE deleted_at IS NULL').first<any>();

  return c.json({
    totalDevices: totalDevicesRes?.count || 0,
    onlineDevices: onlineDevicesRes?.count || 0,
    totalVideos: totalVideosRes?.count || 0,
    totalBytes: totalVideosRes?.total_bytes || 0,
    totalPlaylists: playlistsRes?.count || 0,
    serverTimeUtc: nowUtc
  });
});

// --- VIDEO ROUTES ---
app.get('/api/videos', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM videos WHERE deleted_at IS NULL ORDER BY created_at DESC'
  ).all();
  return c.json({ videos: results });
});

app.post('/api/videos/upload', requireAdmin, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string) || (file ? file.name : 'Untitled');
  const description = (formData.get('description') as string) || '';

  if (!file) {
    return c.json({ error: 'Không tìm thấy file tải lên' }, 400);
  }

  const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const buffer = await file.arrayBuffer();
  const checksum = await computeSha256Hex(buffer);
  const r2Key = `videos/${id}.mp4`;

  // Put file in R2 bucket
  await c.env.VIDEO_BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: file.type || 'video/mp4' }
  });

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO videos (id, title, description, current_version, r2_key, mime_type, size_bytes, duration_seconds, checksum, status, created_at, updated_at)
     VALUES (?, ?, ?, 'v1', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
  )
    .bind(id, title, description, r2Key, file.type || 'video/mp4', buffer.byteLength, 0, checksum, now, now)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO video_versions (id, video_id, version, r2_key, size_bytes, duration_seconds, checksum, created_at)
     VALUES (?, ?, 'v1', ?, ?, ?, ?, ?)`
  )
    .bind(`ver_${Date.now()}`, id, r2Key, buffer.byteLength, 0, checksum, now)
    .run();

  return c.json({
    success: true,
    video: {
      id,
      title,
      r2Key,
      checksum,
      sizeBytes: buffer.byteLength
    }
  });
});

// --- VIDEO MULTIPART CHUNKED UPLOAD (HỖ TRỢ FILE 500MB - 5GB+ KHÔNG BỊ GIỚI HẠN CLOUDFLARE 100MB) ---
app.post('/api/videos/upload/init', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { title, description, sizeBytes, mimeType } = body;

  const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const r2Key = `videos/${id}.mp4`;

  const multipartUpload = await c.env.VIDEO_BUCKET.createMultipartUpload(r2Key, {
    httpMetadata: { contentType: mimeType || 'video/mp4' }
  });

  return c.json({
    videoId: id,
    uploadId: multipartUpload.uploadId,
    r2Key,
    key: multipartUpload.key
  });
});

app.put('/api/videos/upload/part', requireAdmin, async (c) => {
  const uploadId = c.req.header('x-upload-id');
  const key = c.req.header('x-r2-key');
  const partNumberStr = c.req.header('x-part-number');

  if (!uploadId || !key || !partNumberStr) {
    return c.json({ error: 'Thiếu headers định danh multipart upload' }, 400);
  }

  const partNumber = parseInt(partNumberStr, 10);
  const multipartUpload = c.env.VIDEO_BUCKET.resumeMultipartUpload(key, uploadId);
  const chunkBuffer = await c.req.arrayBuffer();

  const uploadedPart = await multipartUpload.uploadPart(partNumber, chunkBuffer);
  return c.json({
    partNumber: uploadedPart.partNumber,
    etag: uploadedPart.etag
  });
});

app.post('/api/videos/upload/complete', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { videoId, uploadId, key, title, description, sizeBytes, mimeType, checksum, parts } = body;

  if (!uploadId || !key || !Array.isArray(parts)) {
    return c.json({ error: 'Thiếu thông tin kết thúc upload' }, 400);
  }

  const multipartUpload = c.env.VIDEO_BUCKET.resumeMultipartUpload(key, uploadId);
  await multipartUpload.complete(parts);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO videos (id, title, description, current_version, r2_key, mime_type, size_bytes, duration_seconds, checksum, status, created_at, updated_at)
     VALUES (?, ?, ?, 'v1', ?, ?, ?, 0, ?, 'ACTIVE', ?, ?)`
  )
    .bind(videoId, title || 'Video mới', description || '', key, mimeType || 'video/mp4', sizeBytes || 0, checksum || `size:${sizeBytes}`, now, now)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO video_versions (id, video_id, version, r2_key, size_bytes, duration_seconds, checksum, created_at)
     VALUES (?, ?, 'v1', ?, ?, 0, ?, ?)`
  )
    .bind(`ver_${Date.now()}`, videoId, key, sizeBytes || 0, checksum || `size:${sizeBytes}`, now)
    .run();

  return c.json({ success: true, videoId, r2Key: key });
});

app.post('/api/videos/upload/abort', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { uploadId, key } = body;
  try {
    if (uploadId && key) {
      const multipartUpload = c.env.VIDEO_BUCKET.resumeMultipartUpload(key, uploadId);
      await multipartUpload.abort();
    }
  } catch {}
  return c.json({ success: true });
});

// Stream video from R2 with HTTP Range 206 support
app.get('/api/videos/:id/stream', async (c) => {
  const id = c.req.param('id');
  const video = await c.env.DB.prepare('SELECT * FROM videos WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<any>();

  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }

  const rangeHeader = c.req.header('Range');
  const object = await c.env.VIDEO_BUCKET.get(video.r2_key, {
    range: rangeHeader ? c.req.raw.headers : undefined
  });

  if (!object) {
    return c.json({ error: 'File not found in storage' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');

  if (rangeHeader && object.range) {
    headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.size - 1}/${object.size}`);
    return new Response(object.body, {
      status: 206,
      headers
    });
  }

  return new Response(object.body, {
    headers
  });
});

app.delete('/api/videos/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE videos SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, id)
    .run();
  return c.json({ success: true, message: 'Đã đánh dấu xóa video' });
});

// --- PLAYLIST ROUTES ---
app.get('/api/playlists', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM playlists WHERE deleted_at IS NULL ORDER BY created_at DESC'
  ).all();
  return c.json({ playlists: results });
});

app.get('/api/playlists/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const playlist = await c.env.DB.prepare('SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<any>();

  if (!playlist) {
    return c.json({ error: 'Playlist not found' }, 404);
  }

  const { results: items } = await c.env.DB.prepare(
    `SELECT pi.*, v.title as video_title, v.r2_key, v.size_bytes, v.checksum
     FROM playlist_items pi
     JOIN videos v ON pi.video_id = v.id
     WHERE pi.playlist_id = ?
     ORDER BY pi.sort_order ASC`
  )
    .bind(id)
    .all();

  return c.json({ playlist, items });
});

app.post('/api/playlists', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = `pl_${Date.now()}`;
  const now = new Date().toISOString();
  const name = body.name || 'Playlist mới';
  const description = body.description || '';

  await c.env.DB.prepare(
    `INSERT INTO playlists (id, name, description, current_version, loop_infinite, is_published, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, 0, ?, ?)`
  )
    .bind(id, name, description, now, now)
    .run();

  return c.json({ success: true, playlistId: id });
});

app.put('/api/playlists/:id/items', requireAdmin, async (c) => {
  const playlistId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const items: any[] = body.items || [];
  const now = new Date().toISOString();

  // Clear existing items and re-insert in batch
  await c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(playlistId).run();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = `pi_${Date.now()}_${i}`;
    await c.env.DB.prepare(
      `INSERT INTO playlist_items (id, playlist_id, video_id, video_version, sort_order, enabled, priority, starts_at, expires_at, expiry_policy, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        playlistId,
        item.videoId,
        item.videoVersion || 'v1',
        i,
        item.enabled ? 1 : 0,
        item.priority || 0,
        item.startsAt || null,
        item.expiresAt || null,
        item.expiryPolicy || 'IMMEDIATE',
        now,
        now
      )
      .run();
  }

  await c.env.DB.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').bind(now, playlistId).run();

  return c.json({ success: true, count: items.length });
});

app.post('/api/playlists/:id/publish', requireAdmin, async (c) => {
  const playlistId = c.req.param('id');
  const playlist = await c.env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(playlistId).first<any>();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const { results: items } = await c.env.DB.prepare(
    `SELECT pi.*, v.title, v.r2_key, v.mime_type, v.size_bytes, v.duration_seconds, v.checksum
     FROM playlist_items pi
     JOIN videos v ON pi.video_id = v.id
     WHERE pi.playlist_id = ?
     ORDER BY pi.sort_order ASC`
  )
    .bind(playlistId)
    .all<any>();

  const newVersion = (playlist.current_version || 0) + 1;
  const origin = new URL(c.req.url).origin;

  const manifestVideos = items.map((it: any) => ({
    videoId: it.video_id,
    version: it.video_version,
    cacheKey: buildCacheKey(it.video_id, it.video_version),
    title: it.title,
    url: `${origin}/api/videos/${it.video_id}/stream`,
    mimeType: it.mime_type || 'video/mp4',
    sizeBytes: it.size_bytes || 0,
    durationSeconds: it.duration_seconds || 0,
    checksum: it.checksum || '',
    startsAt: it.starts_at,
    expiresAt: it.expires_at,
    enabled: Boolean(it.enabled),
    priority: it.priority || 0,
    expiryPolicy: it.expiry_policy || 'IMMEDIATE'
  }));

  const manifest: PlaylistManifest = {
    playlistId,
    version: newVersion,
    timezone: 'Asia/Ho_Chi_Minh',
    checksum: '',
    generatedAt: new Date().toISOString(),
    videos: manifestVideos
  };

  const rawJson = JSON.stringify(manifest.videos);
  manifest.checksum = await computeSha256Hex(rawJson);

  const fullManifestJson = JSON.stringify(manifest);
  const now = new Date().toISOString();

  // Save version snapshot for rollback capability
  await c.env.DB.prepare(
    `INSERT INTO playlist_versions (id, playlist_id, version, manifest_json, checksum, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?)`
  )
    .bind(`pv_${playlistId}_${newVersion}`, playlistId, newVersion, fullManifestJson, manifest.checksum, now)
    .run();

  await c.env.DB.prepare(
    `UPDATE playlists SET current_version = ?, is_published = 1, updated_at = ? WHERE id = ?`
  )
    .bind(newVersion, now, playlistId)
    .run();

  return c.json({ success: true, version: newVersion, manifest });
});

app.post('/api/playlists/:id/rollback', requireAdmin, async (c) => {
  const playlistId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const targetVersion = body.version;

  if (!targetVersion) {
    return c.json({ error: 'Target version required' }, 400);
  }

  const ver = await c.env.DB.prepare(
    'SELECT * FROM playlist_versions WHERE playlist_id = ? AND version = ?'
  )
    .bind(playlistId, targetVersion)
    .first<any>();

  if (!ver) {
    return c.json({ error: 'Version snapshot not found' }, 404);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE playlists SET current_version = ?, updated_at = ? WHERE id = ?')
    .bind(targetVersion, now, playlistId)
    .run();

  return c.json({ success: true, rolledBackToVersion: targetVersion });
});

// --- DEVICE MANAGEMENT & PAIRING ---
app.post('/api/devices/pairing/init', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tempId = body.tempDeviceId || `temp_${Date.now()}`;
  // Generate 6-digit random code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins TTL
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO device_pairing_codes (code, device_temp_id, status, expires_at, created_at)
     VALUES (?, ?, 'PENDING', ?, ?)`
  )
    .bind(code, tempId, expiresAt, now)
    .run();

  return c.json({ code, tempDeviceId: tempId, expiresAt });
});

app.post('/api/devices/pairing/poll', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tempId = body.tempDeviceId;
  if (!tempId) return c.json({ error: 'tempDeviceId required' }, 400);

  const pairing = await c.env.DB.prepare(
    `SELECT * FROM device_pairing_codes WHERE device_temp_id = ? AND status = 'APPROVED' ORDER BY created_at DESC`
  )
    .bind(tempId)
    .first<any>();

  if (!pairing) {
    return c.json({ status: 'PENDING' });
  }

  return c.json({
    status: 'APPROVED',
    deviceId: pairing.device_id,
    deviceToken: pairing.device_token_plain
  });
});

app.post('/api/devices/pairing/claim', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { code, deviceName, playlistId } = body;

  const pairing = await c.env.DB.prepare(
    `SELECT * FROM device_pairing_codes WHERE code = ? AND status = 'PENDING'`
  )
    .bind(code)
    .first<any>();

  if (!pairing) {
    return c.json({ error: 'Mã ghép nối không hợp lệ hoặc đã hết hạn' }, 400);
  }

  const deviceId = `dev_${Date.now()}`;
  const deviceToken = `tok_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
  const tokenHash = await computeSha256Hex(deviceToken);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO devices (id, name, device_token_hash, assigned_playlist_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ONLINE', ?, ?)`
  )
    .bind(deviceId, deviceName || 'Smart TV webOS', tokenHash, playlistId || null, now, now)
    .run();

  await c.env.DB.prepare(
    `UPDATE device_pairing_codes
     SET status = 'APPROVED', device_id = ?, device_token_plain = ?
     WHERE code = ?`
  )
    .bind(deviceId, deviceToken, code)
    .run();

  return c.json({ success: true, deviceId, deviceName });
});

app.get('/api/devices', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.*, p.name as playlist_name
     FROM devices d
     LEFT JOIN playlists p ON d.assigned_playlist_id = p.id
     ORDER BY d.created_at DESC`
  ).all();
  return c.json({ devices: results });
});

app.post('/api/devices/:id/heartbeat', async (c) => {
  const deviceId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE devices
     SET status = 'ONLINE',
         current_video_id = ?,
         synced_playlist_version = ?,
         last_heartbeat_at = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(body.currentVideoId || null, body.syncedPlaylistVersion || 0, now, now, deviceId)
    .run();

  return c.json({ success: true, serverTime: now });
});

// --- PUBLIC MANIFEST (VÀO LINK LÀ XEM LUÔN, KHÔNG CẦN GHÉP NỐI/TOKEN) ---
app.get('/api/public/manifest', async (c) => {
  const playlistIdQuery = c.req.query('playlist');
  const now = new Date().toISOString();

  let playlist: any = null;
  if (playlistIdQuery) {
    playlist = await c.env.DB.prepare('SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL')
      .bind(playlistIdQuery)
      .first<any>();
  } else {
    // Lấy playlist xuất bản mới nhất
    playlist = await c.env.DB.prepare(
      'SELECT * FROM playlists WHERE deleted_at IS NULL AND is_published = 1 ORDER BY updated_at DESC'
    ).first<any>();
    if (!playlist) {
      playlist = await c.env.DB.prepare('SELECT * FROM playlists WHERE deleted_at IS NULL ORDER BY created_at DESC').first<any>();
    }
  }

  if (!playlist) {
    return c.json({ error: 'Chưa có playlist nào được tạo' }, 404);
  }

  const versionRow = await c.env.DB.prepare(
    'SELECT * FROM playlist_versions WHERE playlist_id = ? AND version = ?'
  )
    .bind(playlist.id, playlist.current_version)
    .first<any>();

  if (!versionRow) {
    // Nếu chưa publish version, tự động sinh manifest từ items hiện tại
    const { results: items } = await c.env.DB.prepare(
      `SELECT pi.*, v.title, v.r2_key, v.mime_type, v.size_bytes, v.duration_seconds, v.checksum
       FROM playlist_items pi
       JOIN videos v ON pi.video_id = v.id
       WHERE pi.playlist_id = ?
       ORDER BY pi.sort_order ASC`
    ).bind(playlist.id).all<any>();

    const origin = new URL(c.req.url).origin;
    const manifestVideos = items.map((it: any) => ({
      videoId: it.video_id,
      version: it.video_version || 'v1',
      cacheKey: buildCacheKey(it.video_id, it.video_version || 'v1'),
      title: it.title,
      url: `${origin}/api/videos/${it.video_id}/stream`,
      mimeType: it.mime_type || 'video/mp4',
      sizeBytes: it.size_bytes || 0,
      durationSeconds: it.duration_seconds || 0,
      checksum: it.checksum || '',
      startsAt: it.starts_at,
      expiresAt: it.expires_at,
      enabled: Boolean(it.enabled),
      priority: it.priority || 0,
      expiryPolicy: it.expiry_policy || 'IMMEDIATE'
    }));

    return c.json({
      playlistId: playlist.id,
      version: playlist.current_version,
      timezone: 'Asia/Ho_Chi_Minh',
      checksum: 'live',
      generatedAt: now,
      videos: manifestVideos
    });
  }

  const etag = `"${playlist.id}-v${playlist.current_version}-${versionRow.checksum}"`;
  c.header('ETag', etag);
  c.header('X-Server-Time', now);

  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'X-Server-Time': now
      }
    });
  }

  return c.json(JSON.parse(versionRow.manifest_json));
});

// --- PLAYER MANIFEST SYNC (WITH ETAG & 304) ---
app.get('/api/player/:deviceId/manifest', async (c) => {
  const deviceId = c.req.param('deviceId');
  const now = new Date().toISOString();

  const device = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ?')
    .bind(deviceId)
    .first<any>();

  if (!device || !device.assigned_playlist_id) {
    return c.json({ error: 'Device not assigned to any playlist' }, 404);
  }

  const playlist = await c.env.DB.prepare(
    'SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(device.assigned_playlist_id)
    .first<any>();

  if (!playlist) {
    return c.json({ error: 'Assigned playlist not found' }, 404);
  }

  // Fetch the latest published version
  const versionRow = await c.env.DB.prepare(
    'SELECT * FROM playlist_versions WHERE playlist_id = ? AND version = ?'
  )
    .bind(playlist.id, playlist.current_version)
    .first<any>();

  if (!versionRow) {
    return c.json({ error: 'Playlist has not been published yet' }, 404);
  }

  const etag = `"${playlist.id}-v${playlist.current_version}-${versionRow.checksum}"`;
  c.header('ETag', etag);
  c.header('X-Server-Time', now);

  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'X-Server-Time': now
      }
    });
  }

  return c.json(JSON.parse(versionRow.manifest_json));
});

export default app;
