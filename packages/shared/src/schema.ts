import { z } from 'zod';

export const ExpiryPolicySchema = z.enum(['IMMEDIATE', 'FINISH_CURRENT']);

export const ManifestVideoSchema = z.object({
  videoId: z.string().min(1),
  version: z.string().default('v1'),
  cacheKey: z.string().min(1),
  title: z.string(),
  url: z.string().url(),
  mimeType: z.string().default('video/mp4'),
  sizeBytes: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  checksum: z.string(),
  startsAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  enabled: z.boolean(),
  priority: z.number().int().default(0),
  expiryPolicy: ExpiryPolicySchema.default('IMMEDIATE')
});

export const PlaylistManifestSchema = z.object({
  playlistId: z.string().min(1),
  version: z.number().int().positive(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  checksum: z.string(),
  generatedAt: z.string().datetime(),
  videos: z.array(ManifestVideoSchema)
});

export const VideoCreateSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  description: z.string().optional(),
  mimeType: z.string().default('video/mp4'),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().int().nonnegative().default(0),
  checksum: z.string().min(10)
});

export const PlaylistItemScheduleSchema = z.object({
  videoId: z.string().min(1),
  sortOrder: z.number().int().default(0),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  expiryPolicy: ExpiryPolicySchema.default('IMMEDIATE')
});
