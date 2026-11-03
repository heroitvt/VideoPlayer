# LG Video Signage

Hệ thống Digital Signage phân tán cho Smart TV LG (webOS) chạy hoàn toàn trên Cloudflare Free Tier (Workers + D1 + R2 + Pages).

## 1. Cấu trúc Monorepo
- `apps/admin`: Trang quản trị Web (React + Vite + Tailwind CSS).
- `apps/player`: Web Player chuyên dụng cho Smart TV LG webOS (Fullscreen, PWA, Service Worker, `/diagnostics`).
- `workers/api`: Backend API REST (Hono + Cloudflare D1 + Cloudflare R2 với hỗ trợ HTTP Range 206).
- `packages/shared`: Zod validation, Shared Types, Asia/Ho_Chi_Minh Timezone helper, SHA-256 checksum.
- `packages/cache-manager`: `CacheAdapter`, `VideoCacheManager`, Stream-While-Cache & Targeted Expired Cache Cleanup.
- `packages/player-core`: `PlayerController` State Machine, `VideoScheduler`, `DeviceSyncManager` (ETag 304 polling).
- `database/`: Schema D1 (14 bảng), migrations, seed data.
- `webos/`: `appinfo.json` đóng gói cài đặt webOS.
- `tests/`: Vitest Unit & Integration test suite.

## 2. Các nguyên tắc cốt lõi đã kiểm chứng
1. **Stream While Cache**: Video vừa phát vừa tải cache ngầm, lần phát sau chạy 100% từ cache cục bộ.
2. **Offline Playback**: Khi mất mạng, TV tự động phát các video đã cache mà không tải lại trang.
3. **Video Expiration & Targeted Cache Deletion**: Khi video A hết hạn:
   - Video A bị ngừng phát và xóa đúng cache của video A.
   - Toàn bộ video B, C, D còn hạn được giữ nguyên 100% trong cache.
   - File gốc trên Cloudflare R2 KHÔNG bị xóa.
   - Reference counting: Nếu 2 playlist cùng dùng 1 video, chỉ xóa khi cả 2 đều không còn sử dụng.
4. **Cloudflare Free Tier**: Polling manifest 45s kèm ETag (trả về 304 Not Modified khi không đổi), không tốn quota D1/R2.

## 3. Lệnh kiểm thử & Build
```bash
# Chạy toàn bộ 10 tests tự động (Cache safety, Scheduler, Playback loop, Worker API)
npm test

# Build production tất cả packages và apps
npm run build
```
