import { CacheStorageAdapter, MemoryCacheAdapter, VideoCacheManager } from '@signage/cache-manager';
import {
  PlayerController,
  DeviceSyncManager,
  DeviceDiagnostics
} from '@signage/player-core';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8787';

async function initApp() {
  const root = document.getElementById('app');
  if (!root) return;

  // Register Service Worker if supported on webOS
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const cacheStorage = new CacheStorageAdapter('lg-signage-v1');
  const adapter = (await cacheStorage.isAvailable()) ? cacheStorage : new MemoryCacheAdapter();

  const path = window.location.pathname;
  if (path.startsWith('/diagnostics')) {
    await renderDiagnostics(root, adapter);
    return;
  }

  await startPlayerFlow(root, adapter);
}

async function renderDiagnostics(root: HTMLElement, adapter: any) {
  root.innerHTML = `<div class="diag-container"><h2>Đang chạy kiểm thử tương thích LG webOS...</h2></div>`;
  const results = await DeviceDiagnostics.runAll(adapter);

  const rowsHtml = results
    .map(
      (r) => `
      <div style="padding: 12px; margin-bottom: 10px; border-radius: 6px; background: #1e293b; border-left: 5px solid ${
        r.passed ? '#22c55e' : '#ef4444'
      }">
        <div style="font-weight: bold; font-size: 1.1rem;">
          ${r.passed ? '[PASS]' : '[FAIL]'} ${r.name}
        </div>
        <div style="color: #94a3b8; margin-top: 4px; font-family: monospace;">${r.details}</div>
      </div>`
    )
    .join('');

  root.innerHTML = `
    <div class="diag-container">
      <h1 style="margin-bottom: 1rem;">Chẩn đoán hệ thống LG Video Signage (/diagnostics)</h1>
      ${rowsHtml}
    </div>
  `;
}

async function startPlayerFlow(root: HTMLElement, adapter: any) {
  const urlParams = new URLSearchParams(window.location.search);
  const targetPlaylistId = urlParams.get('playlist') || undefined;

  const deviceId = localStorage.getItem('lg_signage_device_id') || undefined;
  const deviceToken = localStorage.getItem('lg_signage_device_token') || undefined;

  const cacheManager = new VideoCacheManager({ adapter, verifyChecksum: true });
  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.controls = false;

  const syncManager = new DeviceSyncManager({
    apiBaseUrl: API_BASE,
    deviceId,
    deviceToken,
    playlistId: targetPlaylistId,
    pollIntervalMs: 45000,
    onManifestUpdated: (manifest) => {
      controller.loadManifest(manifest);
      if (controller.getState() !== 'PLAYING') {
        controller.playNext();
      }
    }
  });

  const controller = new PlayerController({
    cacheManager,
    getServerTime: () => syncManager.getServerNow(),
    onPlayVideo: (_video, url) => {
      root.innerHTML = '';
      root.appendChild(videoEl);
      if (videoEl.src !== url) {
        videoEl.src = url;
      }
      videoEl.play().catch(() => {
        videoEl.muted = true;
        videoEl.play().catch(() => controller.handleVideoError());
      });
    },
    onStandby: () => {
      root.innerHTML = `
        <div class="standby-box">
          <h2>LG Video Signage</h2>
          <p style="color: #94a3b8; margin-top: 0.5rem;">Đang chờ lịch phát hoặc nội dung hợp lệ...</p>
        </div>
      `;
    }
  });

  videoEl.addEventListener('ended', () => {
    controller.handleVideoEnded();
  });

  videoEl.addEventListener('error', () => {
    controller.handleVideoError();
  });

  // Load offline snapshot immediately if available
  const existingSnapshot = syncManager.getCurrentManifest();
  if (existingSnapshot) {
    controller.loadManifest(existingSnapshot);
    await controller.playNext();
  }

  // Sync remote manifest and start playing immediately without pairing lock
  const syncResult = await syncManager.syncOnce();
  if (syncResult.manifest) {
    controller.loadManifest(syncResult.manifest);
    await controller.playNext();
  }
  syncManager.startPolling();

  // Check active video expiration every 5 seconds
  setInterval(() => {
    controller.checkActiveVideoExpirationTick();
  }, 5000);
}

initApp();
