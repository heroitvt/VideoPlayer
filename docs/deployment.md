# Deployment & Rollback Guide

## 1. Deploy Backend Worker
```bash
npm run deploy --workspace=workers/api
```

## 2. Deploy Admin Dashboard & TV Player (Cloudflare Pages)
```bash
# Build Admin
npm run build --workspace=apps/admin
npx wrangler pages deploy apps/admin/dist --project-name=lg-signage-admin

# Build Player
npm run build --workspace=apps/player
npx wrangler pages deploy apps/player/dist --project-name=lg-signage-player
```

## 3. Rollback Procedure
- Playlist Rollback: In Admin UI -> Playlist -> click "Rollback phiên bản" -> enter previous version number. API restores previous immutable `manifest_json` snapshot immediately.
- Worker Rollback: `npx wrangler rollback`
