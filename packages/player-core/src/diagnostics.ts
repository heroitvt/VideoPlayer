import { CacheAdapter } from '@signage/cache-manager';

export interface DiagnosticResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export class DeviceDiagnostics {
  static async runAll(adapter: CacheAdapter): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 1. User Agent & webOS detection
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test';
    const isWebOS = /Web0S|webOS|LG Browser/i.test(ua);
    results.push({
      id: 'webos-env',
      name: 'Môi trường trình duyệt / webOS',
      passed: true,
      details: `UA: ${ua} (Detected webOS: ${isWebOS ? 'Yes' : 'Standard Browser'})`
    });

    // 2. HTML5 Video H.264 Codec
    let h264Supported = true;
    if (typeof document !== 'undefined') {
      const video = document.createElement('video');
      const canPlay = video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
      h264Supported = canPlay === 'probably' || canPlay === 'maybe';
    }
    results.push({
      id: 'codec-h264',
      name: 'Hỗ trợ Codec MP4 H.264/AAC',
      passed: h264Supported,
      details: h264Supported ? 'Codec avc1.42E01E + mp4a.40.2 supported' : 'Codec unsupported'
    });

    // 3. Service Worker support
    const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    results.push({
      id: 'service-worker',
      name: 'Service Worker API',
      passed: swSupported,
      details: swSupported ? 'navigator.serviceWorker available' : 'Not available in this context'
    });

    // 4. Real Write / Read / Targeted Delete verification on CacheAdapter
    try {
      const keyA = '__diag_test_video_A__';
      const keyB = '__diag_test_video_B__';
      const payloadA = new TextEncoder().encode('DIAGNOSTIC_PAYLOAD_A').buffer;
      const payloadB = new TextEncoder().encode('DIAGNOSTIC_PAYLOAD_B').buffer;

      await adapter.put(keyA, payloadA);
      await adapter.put(keyB, payloadB);

      const readA = await adapter.get(keyA);
      const readB = await adapter.get(keyB);
      const sizeA = readA ? (readA instanceof ArrayBuffer ? readA.byteLength : (readA as Blob).size) : 0;
      const writeOk = Boolean(readA && sizeA === payloadA.byteLength && readB);

      // Delete only A, verify B remains intact
      await adapter.delete(keyA);
      const hasAAfter = await adapter.has(keyA);
      const hasBAfter = await adapter.has(keyB);
      await adapter.delete(keyB);

      const targetedOk = writeOk && !hasAAfter && hasBAfter;
      results.push({
        id: 'cache-rw-targeted-delete',
        name: 'Kiểm thử thực tế Ghi/Đọc & Xóa có mục tiêu (Targeted Delete)',
        passed: targetedOk,
        details: targetedOk
          ? `Adapter (${adapter.name}): Ghi A & B thành công, xóa A giữ nguyên B chính xác.`
          : 'Lỗi đọc/ghi hoặc xóa nhầm cache.'
      });
    } catch (err: any) {
      results.push({
        id: 'cache-rw-targeted-delete',
        name: 'Kiểm thử thực tế Ghi/Đọc & Xóa có mục tiêu (Targeted Delete)',
        passed: false,
        details: `Error: ${err?.message || String(err)}`
      });
    }

    return results;
  }
}
