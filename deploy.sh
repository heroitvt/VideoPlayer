#!/usr/bin/env bash
set -e

echo "=== 1. Kiểm tra đăng nhập Cloudflare Wrangler ==="
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo "Đang mở trình duyệt để xác thực Cloudflare (Bấm Allow trên trình duyệt)..."
  npx wrangler login
fi

echo "=== 2. Khởi tạo Database Cloudflare D1 (lg-signage-db) ==="
D1_OUT=$(npx wrangler d1 create lg-signage-db 2>&1 || true)
echo "$D1_OUT"

DB_ID=$(echo "$D1_OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1 || true)

if [ -z "$DB_ID" ]; then
  echo "Database đã tồn tại, đang lấy database_id từ danh sách..."
  DB_ID=$(npx wrangler d1 list --json | node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(0, 'utf8'));
    const found = data.find(d => d.name === 'lg-signage-db');
    if (found) console.log(found.uuid);
  ")
fi

if [ -n "$DB_ID" ]; then
  echo "=> Tìm thấy D1 database_id: $DB_ID"
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('wrangler.jsonc', 'utf8');
    content = content.replace(/\"database_id\":\s*\"[^\"]+\"/, '\"database_id\": \"$DB_ID\"');
    fs.writeFileSync('wrangler.jsonc', content);
  "
fi

echo "=== 3. Chạy Migration & Seed trên D1 Remote ==="
npx wrangler d1 execute lg-signage-db --remote --file=./database/migrations/0001_initial.sql -y
npx wrangler d1 execute lg-signage-db --remote --file=./database/seeds/seed.sql -y

echo "=== 4. Khởi tạo Kho lưu trữ Video R2 (lg-signage-videos) ==="
npx wrangler r2 bucket create lg-signage-videos 2>&1 || echo "Bucket lg-signage-videos đã sẵn sàng."

echo "=== 5. Deploy Backend API Worker ==="
npx wrangler deploy

echo "=== 6. Build Frontend Admin & TV Player với API Production ==="
VITE_API_BASE_URL="https://lg-video-signage-api.heroit8x.workers.dev" VITE_PLAYER_URL="https://vnvc-player.pages.dev" npm run build

echo "=== 7. Tạo & Deploy Cloudflare Pages (Admin & TV Player) ==="
npx wrangler pages project create vnvc-admin --production-branch=main 2>&1 || true
npx wrangler pages deploy apps/admin/dist --project-name=vnvc-admin --branch=main

npx wrangler pages project create vnvc-player --production-branch=main 2>&1 || true
npx wrangler pages deploy apps/player/dist --project-name=vnvc-player --branch=main

echo "=== HOÀN TẤT DEPLOY LÊN CLOUDFLARE! ==="
