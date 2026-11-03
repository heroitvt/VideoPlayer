# Cloudflare Free Tier Setup Guide

## 1. Prerequisites
- Cloudflare Account (Free Tier).
- Node.js 20+ & npm.

## 2. Resource Allocation (Free Tier Quotas)
- Workers: 100,000 requests/day.
- D1: 5 million read units/day, 100,000 write units/day, 5 GB storage.
- R2: 10 GB storage, 1M Class A operations/month, 10M Class B operations/month, zero egress fees.
- Pages: Unlimited static bandwidth.

## 3. Provisioning Steps
```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Create D1 database
npx wrangler d1 create lg-signage-db

# 3. Create R2 bucket
npx wrangler r2 bucket create lg-signage-videos

# 4. Apply migrations
npx wrangler d1 execute lg-signage-db --file=./database/migrations/0001_initial.sql

# 5. Seed initial data
npx wrangler d1 execute lg-signage-db --file=./database/seeds/seed.sql

# 6. Set Admin credentials & JWT secret
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_PASSWORD
```
