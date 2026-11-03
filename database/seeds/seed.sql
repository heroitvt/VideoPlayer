-- Seed data for testing and initial development

INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at, updated_at)
VALUES (
  'usr_admin_001',
  'admin',
  'pbkdf2$100000$mock_salt$mock_hash_for_admin_changeme',
  'ADMIN',
  '2026-11-03T00:00:00.000Z',
  '2026-11-03T00:00:00.000Z'
);

INSERT OR IGNORE INTO playlists (id, name, description, current_version, loop_infinite, is_published, created_at, updated_at)
VALUES (
  'pl_demo_001',
  'Playlist Mặc Định Sảnh',
  'Playlist quảng cáo chính chiếu tại màn hình sảnh',
  1,
  1,
  1,
  '2026-11-03T00:00:00.000Z',
  '2026-11-03T00:00:00.000Z'
);
