import { describe, it, expect } from 'vitest';
import app from '../../workers/api/src/index';

// In-memory mock D1 and R2 for testing
class MockD1PreparedStatement {
  private sql: string;
  private params: any[] = [];
  private db: MockD1Database;

  constructor(sql: string, db: MockD1Database, params: any[] = []) {
    this.sql = sql;
    this.db = db;
    this.params = params;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, this.db, params);
  }

  async first<T = any>(): Promise<T | null> {
    const res = await this.all<T>();
    return res.results[0] || null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    return this.db.executeQuery(this.sql, this.params);
  }

  async run(): Promise<{ success: boolean }> {
    await this.db.executeMutation(this.sql, this.params);
    return { success: true };
  }
}

class MockD1Database {
  public tables: Record<string, any[]> = {
    users: [],
    devices: [],
    playlists: [],
    playlist_items: [],
    playlist_versions: [],
    device_pairing_codes: [],
    videos: [],
    video_versions: []
  };

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  async executeMutation(sql: string, params: any[]) {
    if (sql.includes('INSERT OR REPLACE INTO users')) {
      const idx = this.tables.users.findIndex((u) => u.username === params[1]);
      const row = { id: params[0], username: params[1], password_hash: params[2], role: params[3] };
      if (idx >= 0) this.tables.users[idx] = row;
      else this.tables.users.push(row);
    } else if (sql.includes('INSERT INTO device_pairing_codes')) {
      this.tables.device_pairing_codes.push({
        code: params[0],
        device_temp_id: params[1],
        status: 'PENDING',
        expires_at: params[2],
        created_at: params[3]
      });
    } else if (sql.includes('UPDATE device_pairing_codes')) {
      const row = this.tables.device_pairing_codes.find((r) => r.code === params[2]);
      if (row) {
        row.status = 'APPROVED';
        row.device_id = params[0];
        row.device_token_plain = params[1];
      }
    } else if (sql.includes('INSERT INTO devices')) {
      this.tables.devices.push({
        id: params[0],
        name: params[1],
        device_token_hash: params[2],
        assigned_playlist_id: params[3],
        status: 'ONLINE',
        created_at: params[4],
        updated_at: params[5]
      });
    } else if (sql.includes('INSERT INTO playlists')) {
      this.tables.playlists.push({
        id: params[0],
        name: params[1],
        description: params[2],
        current_version: 1,
        is_published: 0,
        deleted_at: null
      });
    } else if (sql.includes('INSERT INTO playlist_versions')) {
      this.tables.playlist_versions.push({
        id: params[0],
        playlist_id: params[1],
        version: params[2],
        manifest_json: params[3],
        checksum: params[4]
      });
    } else if (sql.includes('UPDATE playlists SET current_version')) {
      const pl = this.tables.playlists.find((p) => p.id === params[2]);
      if (pl) {
        pl.current_version = params[0];
        pl.is_published = 1;
      }
    }
  }

  async executeQuery(sql: string, params: any[]): Promise<{ results: any[] }> {
    if (sql.includes('FROM users WHERE username = ?')) {
      const match = this.tables.users.filter((r) => r.username === params[0]);
      return { results: match };
    }
    if (sql.includes('FROM device_pairing_codes WHERE code = ?')) {
      const match = this.tables.device_pairing_codes.filter((r) => r.code === params[0] && r.status === 'PENDING');
      return { results: match };
    }
    if (sql.includes('FROM device_pairing_codes WHERE device_temp_id = ?')) {
      const match = this.tables.device_pairing_codes.filter((r) => r.device_temp_id === params[0] && r.status === 'APPROVED');
      return { results: match };
    }
    if (sql.includes('FROM devices WHERE id = ?')) {
      const match = this.tables.devices.filter((r) => r.id === params[0]);
      return { results: match };
    }
    if (sql.includes('FROM playlists WHERE id = ?')) {
      const match = this.tables.playlists.filter((r) => r.id === params[0]);
      return { results: match };
    }
    if (sql.includes('FROM playlists WHERE deleted_at IS NULL')) {
      return { results: this.tables.playlists };
    }
    if (sql.includes('FROM playlist_versions WHERE playlist_id = ? AND version = ?')) {
      const match = this.tables.playlist_versions.filter((r) => r.playlist_id === params[0] && r.version === params[1]);
      return { results: match };
    }
    if (sql.includes('FROM playlist_items')) {
      return { results: [] };
    }
    if (sql.includes('SELECT count(*) as count FROM devices')) {
      return { results: [{ count: this.tables.devices.length }] };
    }
    if (sql.includes('SELECT count(*) as count FROM playlists')) {
      return { results: [{ count: this.tables.playlists.length }] };
    }
    if (sql.includes('SELECT count(*) as count, sum(size_bytes) as total_bytes FROM videos')) {
      return { results: [{ count: 0, total_bytes: 0 }] };
    }
    return { results: [] };
  }
}

describe('Worker REST API & ETag Manifest Tests', () => {
  const mockDb = new MockD1Database();
  const mockEnv: any = {
    DB: mockDb,
    VIDEO_BUCKET: {
      get: async () => null,
      put: async () => ({})
    },
    JWT_SECRET: 'test_secret_for_integration_tests_1234567890',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'password123'
  };

  let adminJwt = '';

  it('Rejects invalid admin credentials with 401', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' })
    }, mockEnv);
    expect(res.status).toBe(401);
  });

  it('Authenticates admin and returns valid JWT token', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    }, mockEnv);
    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.token).toBeDefined();
    adminJwt = data.token;
  });

  it('Guards admin dashboard stats requiring Authorization header', async () => {
    const unauthRes = await app.request('/api/stats/dashboard', {}, mockEnv);
    expect(unauthRes.status).toBe(401);

    const authRes = await app.request('/api/stats/dashboard', {
      headers: { Authorization: `Bearer ${adminJwt}` }
    }, mockEnv);
    expect(authRes.status).toBe(200);
  });

  it('Executes device pairing handshake, claim, and ETag 304 sync cycle', async () => {
    // 1. TV Player requests pairing code
    const initRes = await app.request('/api/devices/pairing/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempDeviceId: 'tv-test-01' })
    }, mockEnv);
    expect(initRes.status).toBe(200);
    const initData = await initRes.json<any>();
    expect(initData.code).toHaveLength(6);

    // 2. Admin creates playlist and publishes it
    const plRes = await app.request('/api/playlists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Playlist Sảnh Test' })
    }, mockEnv);
    const { playlistId } = await plRes.json<any>();

    // Publish playlist to produce manifest
    const pubRes = await app.request(`/api/playlists/${playlistId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminJwt}` }
    }, mockEnv);
    expect(pubRes.status).toBe(200);

    // 3. Admin claims pairing code with device name & playlist assignment
    const claimRes = await app.request('/api/devices/pairing/claim', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: initData.code,
        deviceName: 'LG 55 Inch Lobby',
        playlistId
      })
    }, mockEnv);
    expect(claimRes.status).toBe(200);
    const { deviceId } = await claimRes.json<any>();

    // 4. TV polls and detects pairing approval
    const pollRes = await app.request('/api/devices/pairing/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempDeviceId: 'tv-test-01' })
    }, mockEnv);
    const pollData = await pollRes.json<any>();
    expect(pollData.status).toBe('APPROVED');
    expect(pollData.deviceId).toBe(deviceId);

    // 5. TV fetches manifest for first time (returns 200 + ETag)
    const manifestRes1 = await app.request(`/api/player/${deviceId}/manifest`, {}, mockEnv);
    expect(manifestRes1.status).toBe(200);
    const etag = manifestRes1.headers.get('ETag');
    expect(etag).toBeTruthy();

    // 5b. Public link access without any device token or pairing: returns 200 + ETag
    const publicRes = await app.request('/api/public/manifest', {}, mockEnv);
    expect(publicRes.status).toBe(200);
    const publicManifest = await publicRes.json<any>();
    expect(publicManifest.playlistId).toBe(playlistId);

    // 6. TV polls again sending If-None-Match: returns 304 Not Modified without downloading payload
    const manifestRes2 = await app.request(`/api/player/${deviceId}/manifest`, {
      headers: { 'If-None-Match': etag! }
    }, mockEnv);
    expect(manifestRes2.status).toBe(304);
  });

  it('Allows admin to change password and authenticate with new credentials', async () => {
    // 1. Change password from 'password123' to 'newSecretPass2026'
    const changeRes = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword: 'password123',
        newPassword: 'newSecretPass2026'
      })
    }, mockEnv);
    expect(changeRes.status).toBe(200);

    // 2. Old password should now fail with 401
    const oldLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    }, mockEnv);
    expect(oldLoginRes.status).toBe(401);

    // 3. New password succeeds and emits fresh token
    const newLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'newSecretPass2026' })
    }, mockEnv);
    expect(newLoginRes.status).toBe(200);
    const newData = await newLoginRes.json<any>();
    expect(newData.token).toBeTruthy();
  });
});
