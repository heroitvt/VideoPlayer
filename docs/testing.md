# Testing Guide

## Test Suite Overview
- Unit & Cache Safety Tests: `tests/unit/`
- Integration & API Tests: `tests/integration/`
- E2E Scenarios: `tests/e2e/`

## Run All Tests
```bash
npm test
```

## Critical Cache Safety Test (`tests/unit/cache-safety.test.ts`)
Verifies:
1. Initial state: Videos A, B, C, D cached (`COMPLETE`).
2. Video A expires (`expiresAt <= now`).
3. Videos B, C, D remain active.
4. After eviction:
   - Video A cache entry is deleted (`has('A') === false`).
   - Videos B, C, D remain `COMPLETE` and playable offline (`has('B') === true`, etc.).
   - Shared reference counting prevents deleting a cache key still used by another active playlist.
