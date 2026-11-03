import React, { useState, useEffect } from 'react';
import { formatVietnamTime } from '@signage/shared';
import { SchedulePicker } from './SchedulePicker';
import { Key } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8787';
const PLAYER_URL = (import.meta as any).env?.VITE_PLAYER_URL || 'https://vnvc-player.pages.dev';

interface UploadProgressState {
  active: boolean;
  fileName: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  currentPart: number;
  totalParts: number;
  error?: string;
}

type TabKey = 'dashboard' | 'videos' | 'playlists' | 'drive';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('lg_admin_jwt'));
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Login State
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Password Change State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ error: '', success: '' });

  // Upload Progress State
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({
    active: false,
    fileName: '',
    loadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    currentPart: 0,
    totalParts: 0
  });

  // Data States
  const [stats, setStats] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
  const [playlistItems, setPlaylistItems] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Pairing Form
  const [pairCode, setPairCode] = useState('');
  const [pairName, setPairName] = useState('');
  const [pairPlaylistId, setPairPlaylistId] = useState('');

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${token}`
  });

  useEffect(() => {
    if (token) {
      fetchAllData();
    }
  }, [token]);

  async function fetchAllData() {
    try {
      const [statsRes, vidRes, plRes, devRes] = await Promise.all([
        fetch(`${API_BASE}/api/stats/dashboard`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/videos`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/playlists`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/devices`, { headers: authHeaders() })
      ]);

      if (statsRes.status === 401) {
        handleLogout();
        return;
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (vidRes.ok) {
        const d = await vidRes.json();
        setVideos(d.videos || []);
      }
      if (plRes.ok) {
        const d = await plRes.json();
        setPlaylists(d.playlists || []);
      }
      if (devRes.ok) {
        const d = await devRes.json();
        setDevices(d.devices || []);
      }
    } catch {
      // Ignore network error during refresh
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Đăng nhập thất bại');
        return;
      }
      localStorage.setItem('lg_admin_jwt', data.token);
      setToken(data.token);
    } catch {
      setLoginError('Không thể kết nối tới API Worker');
    }
  }

  function handleLogout() {
    localStorage.removeItem('lg_admin_jwt');
    setToken(null);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg({ error: '', success: '' });

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ error: 'Mật khẩu mới và xác nhận mật khẩu không khớp', success: '' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự', success: '' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordMsg({ error: data.error || 'Đổi mật khẩu thất bại', success: '' });
        return;
      }
      setPasswordMsg({ error: '', success: 'Đổi mật khẩu thành công!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordMsg({ error: '', success: '' });
      }, 1500);
    } catch {
      setPasswordMsg({ error: 'Không thể kết nối đến máy chủ', success: '' });
    }
  }

  async function handleUploadVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset input to allow re-uploading same file if needed

    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk (safely under Cloudflare 100MB body limit)
    const totalBytes = file.size;
    const totalParts = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));

    setUploading(true);
    setUploadProgress({
      active: true,
      fileName: file.name,
      loadedBytes: 0,
      totalBytes,
      percent: 0,
      currentPart: 1,
      totalParts,
      error: undefined
    });

    let uploadId = '';
    let r2Key = '';

    try {
      // 1. Khởi tạo Multipart Upload
      const initRes = await fetch(`${API_BASE}/api/videos/upload/init`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: file.name,
          sizeBytes: totalBytes,
          mimeType: file.type || 'video/mp4'
        })
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi khởi tạo upload (${initRes.status})`);
      }

      const initData = await initRes.json();
      uploadId = initData.uploadId;
      r2Key = initData.r2Key;
      const videoId = initData.videoId;

      const uploadedParts: { partNumber: number; etag: string }[] = [];
      let loadedBytes = 0;

      // 2. Tải từng phần (chunk) lên R2
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalBytes);
        const chunkBlob = file.slice(start, end);

        setUploadProgress((prev) => ({
          ...prev,
          currentPart: partNumber,
          loadedBytes,
          percent: Math.round((loadedBytes / totalBytes) * 100)
        }));

        const partRes = await fetch(`${API_BASE}/api/videos/upload/part`, {
          method: 'PUT',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/octet-stream',
            'x-upload-id': uploadId,
            'x-r2-key': r2Key,
            'x-part-number': String(partNumber)
          },
          body: chunkBlob
        });

        if (!partRes.ok) {
          const partErr = await partRes.json().catch(() => ({}));
          throw new Error(partErr.error || `Lỗi tải lên phần ${partNumber}/${totalParts}`);
        }

        const partData = await partRes.json();
        uploadedParts.push({ partNumber: partData.partNumber, etag: partData.etag });
        loadedBytes += chunkBlob.size;

        setUploadProgress((prev) => ({
          ...prev,
          loadedBytes,
          percent: Math.round((loadedBytes / totalBytes) * 100)
        }));
      }

      // 3. Hoàn tất Multipart Upload
      setUploadProgress((prev) => ({ ...prev, percent: 100 }));
      const completeRes = await fetch(`${API_BASE}/api/videos/upload/complete`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          uploadId,
          key: r2Key,
          title: file.name,
          sizeBytes: totalBytes,
          mimeType: file.type || 'video/mp4',
          parts: uploadedParts
        })
      });

      if (!completeRes.ok) {
        const compErr = await completeRes.json().catch(() => ({}));
        throw new Error(compErr.error || 'Lỗi ghép nối các phần video');
      }

      await fetchAllData();
      setTimeout(() => {
        setUploadProgress({
          active: false,
          fileName: '',
          loadedBytes: 0,
          totalBytes: 0,
          percent: 0,
          currentPart: 0,
          totalParts: 0
        });
        setUploading(false);
      }, 1000);
    } catch (err: any) {
      // Hủy multipart upload nếu gặp sự cố
      if (uploadId && r2Key) {
        fetch(`${API_BASE}/api/videos/upload/abort`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId, key: r2Key })
        }).catch(() => {});
      }

      setUploadProgress((prev) => ({
        ...prev,
        error: err?.message || 'Có lỗi xảy ra khi tải video lên kho Cloudflare R2'
      }));
      setUploading(false);
    }
  }

  async function handleDeleteVideo(id: string) {
    if (!confirm('Xác nhận xóa video này khỏi thư viện?')) return;
    await fetch(`${API_BASE}/api/videos/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    await fetchAllData();
  }

  async function handleCreatePlaylist() {
    const name = prompt('Nhập tên Playlist mới:');
    if (!name) return;
    await fetch(`${API_BASE}/api/playlists`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await fetchAllData();
  }

  async function handleSelectPlaylist(id: string) {
    const res = await fetch(`${API_BASE}/api/playlists/${id}`, {
      headers: authHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedPlaylist(data.playlist);
      setPlaylistItems(
        (data.items || []).map((it: any) => ({
          videoId: it.video_id,
          videoTitle: it.video_title,
          videoVersion: it.video_version || 'v1',
          enabled: Boolean(it.enabled),
          startsAt: it.starts_at || '',
          expiresAt: it.expires_at || '',
          expiryPolicy: it.expiry_policy || 'IMMEDIATE'
        }))
      );
    }
  }

  async function handleSaveAndPublishPlaylist() {
    if (!selectedPlaylist) return;
    await fetch(`${API_BASE}/api/playlists/${selectedPlaylist.id}/items`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: playlistItems.map((it) => ({
          ...it,
          startsAt: it.startsAt ? new Date(it.startsAt).toISOString() : null,
          expiresAt: it.expiresAt ? new Date(it.expiresAt).toISOString() : null
        }))
      })
    });

    await fetch(`${API_BASE}/api/playlists/${selectedPlaylist.id}/publish`, {
      method: 'POST',
      headers: authHeaders()
    });

    alert('Đã lưu và xuất bản Playlist thành công!');
    await handleSelectPlaylist(selectedPlaylist.id);
    await fetchAllData();
  }

  async function handleRollbackPlaylist() {
    if (!selectedPlaylist) return;
    const targetVer = Number(prompt('Nhập số phiên bản (version) muốn khôi phục:', String(Math.max(1, selectedPlaylist.current_version - 1))));
    if (!targetVer) return;
    const res = await fetch(`${API_BASE}/api/playlists/${selectedPlaylist.id}/rollback`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: targetVer })
    });
    if (res.ok) {
      alert(`Đã rollback về phiên bản v${targetVer}`);
      await handleSelectPlaylist(selectedPlaylist.id);
      await fetchAllData();
    } else {
      alert('Không tìm thấy bản lưu của version này');
    }
  }

  async function handleClaimDevice(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/devices/pairing/claim`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: pairCode.trim(),
        deviceName: pairName.trim() || 'LG Smart TV',
        playlistId: pairPlaylistId || null
      })
    });
    if (res.ok) {
      setPairCode('');
      setPairName('');
      await fetchAllData();
      alert('Ghép nối TV thành công!');
    } else {
      const err = await res.json();
      alert(err.error || 'Lỗi ghép nối');
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 p-8 rounded-xl w-full max-w-md space-y-5">
          <h1 className="text-2xl font-bold text-sky-400">LG Video Signage Admin</h1>
          {loginError && <div className="bg-red-900/40 text-red-300 p-3 rounded text-sm">{loginError}</div>}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Tài khoản</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </div>
          <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 rounded">
            Đăng nhập
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="text-xl font-bold text-sky-400">LG Video Signage</div>
          <a
            href={PLAYER_URL}
            target="_blank"
            rel="noreferrer"
            className="block text-center bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 py-2 px-3 rounded-lg text-xs font-semibold"
          >
            ▶ Mở TV Web Player (Xem ngay)
          </a>
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'videos', label: 'Thư viện Video' },
              { id: 'playlists', label: 'Playlist & Lịch phát' },
              { id: 'drive', label: 'Drive & Dung lượng R2' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabKey)}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === item.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="space-y-1 border-t border-slate-800 pt-4">
          <button
            onClick={() => {
              setPasswordMsg({ error: '', success: '' });
              setShowPasswordModal(true);
            }}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-sky-400 text-left px-4 py-2 w-full rounded-lg hover:bg-slate-800/50 transition"
          >
            <Key className="w-4 h-4" />
            <span>Đổi mật khẩu</span>
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 text-left px-4 py-2 w-full rounded-lg hover:bg-slate-800/50 transition"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Modal Đổi mật khẩu */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleChangePassword}
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-sky-400 flex items-center gap-2">
                <Key className="w-5 h-5" />
                Đổi mật khẩu Quản trị
              </h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {passwordMsg.error && (
              <div className="bg-red-900/40 border border-red-700/50 text-red-300 p-3 rounded-lg text-xs">
                {passwordMsg.error}
              </div>
            )}
            {passwordMsg.success && (
              <div className="bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 p-3 rounded-lg text-xs">
                {passwordMsg.success}
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">Mật khẩu hiện tại</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Mật khẩu mới (Tối thiểu 6 ký tự)</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white"
              >
                Lưu mật khẩu mới
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Tổng quan hệ thống</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <div className="text-slate-400 text-sm">Tổng số Smart TV</div>
                <div className="text-3xl font-bold mt-2">{stats?.totalDevices ?? 0}</div>
                <div className="text-xs text-emerald-400 mt-1">Online: {stats?.onlineDevices ?? 0}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <div className="text-slate-400 text-sm">Tổng số Video</div>
                <div className="text-3xl font-bold mt-2">{stats?.totalVideos ?? 0}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <div className="text-slate-400 text-sm">Dung lượng Cloudflare R2</div>
                <div className="text-3xl font-bold mt-2">
                  {((stats?.totalBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                </div>
                <div className="text-xs text-slate-400 mt-1">Free Tier Limit: 10 GB</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <div className="text-slate-400 text-sm">Playlist đang hoạt động</div>
                <div className="text-3xl font-bold mt-2">{stats?.totalPlaylists ?? 0}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Thư viện Video (Cloudflare R2)</h2>
              <label
                className={`${
                  uploading ? 'bg-slate-700 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500 cursor-pointer'
                } text-white px-4 py-2 rounded-lg text-sm font-medium transition`}
              >
                {uploading ? `Đang tải lên (${uploadProgress.percent}%)...` : '+ Upload Video MP4'}
                <input type="file" accept="video/mp4" onChange={handleUploadVideo} className="hidden" disabled={uploading} />
              </label>
            </div>

            {uploadProgress.active && (
              <div className="bg-slate-900 border border-sky-500/40 rounded-xl p-5 space-y-3 shadow-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold text-sky-300 truncate max-w-lg">
                    Đang tải lên: {uploadProgress.fileName}
                  </div>
                  <div className="font-bold text-white">
                    {uploadProgress.percent}%
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800 h-3.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      uploadProgress.error ? 'bg-red-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${Math.max(2, uploadProgress.percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Đã tải: {(uploadProgress.loadedBytes / (1024 * 1024)).toFixed(2)} MB /{' '}
                    {(uploadProgress.totalBytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                  <span>
                    Phân đoạn (Chunk 10MB): Phần {uploadProgress.currentPart} / {uploadProgress.totalParts}
                  </span>
                </div>

                {uploadProgress.error && (
                  <div className="flex items-center justify-between bg-red-950/60 border border-red-700/60 text-red-300 px-3 py-2 rounded-lg text-xs">
                    <span>Lỗi: {uploadProgress.error}</span>
                    <button
                      type="button"
                      onClick={() => setUploadProgress((prev) => ({ ...prev, active: false, error: undefined }))}
                      className="text-white underline font-semibold ml-4"
                    >
                      Đóng
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/60 text-slate-400">
                  <tr>
                    <th className="p-4">Tên Video</th>
                    <th className="p-4">Kích thước</th>
                    <th className="p-4">Checksum (SHA-256)</th>
                    <th className="p-4">Ngày tạo (VN)</th>
                    <th className="p-4">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {videos.map((v) => (
                    <tr key={v.id}>
                      <td className="p-4 font-medium">{v.title}</td>
                      <td className="p-4">{(v.size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                      <td className="p-4 font-mono text-xs text-slate-400">{v.checksum?.slice(0, 16)}...</td>
                      <td className="p-4">{v.created_at ? formatVietnamTime(v.created_at) : '-'}</td>
                      <td className="p-4">
                        <button
                          onClick={() => handleDeleteVideo(v.id)}
                          className="text-red-400 hover:text-red-300 text-xs font-semibold"
                        >
                          Xóa khỏi thư viện
                        </button>
                      </td>
                    </tr>
                  ))}
                  {videos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        Chưa có video nào trên kho lưu trữ R2.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Quản lý Playlist & Lịch phát (Asia/Ho_Chi_Minh)</h2>
              <button
                onClick={handleCreatePlaylist}
                className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                + Tạo Playlist
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-slate-300 mb-2">Danh sách Playlist</h3>
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPlaylist(p.id)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      selectedPlaylist?.id === p.id
                        ? 'border-sky-500 bg-sky-950/40'
                        : 'border-slate-800 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      Phiên bản: v{p.current_version} • {p.is_published ? 'Đã xuất bản' : 'Bản nháp'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                {selectedPlaylist ? (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div>
                        <h3 className="text-lg font-bold">{selectedPlaylist.name}</h3>
                        <p className="text-xs text-slate-400">Version hiện tại: v{selectedPlaylist.current_version}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleRollbackPlaylist}
                          className="bg-amber-600/20 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded text-xs font-medium"
                        >
                          Rollback phiên bản
                        </button>
                        <button
                          onClick={handleSaveAndPublishPlaylist}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-xs font-semibold"
                        >
                          Lưu & Xuất bản (Publish)
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      <select
                        id="add-video-select"
                        className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm flex-1"
                        defaultValue=""
                        onChange={(e) => {
                          const v = videos.find((vid) => vid.id === e.target.value);
                          if (!v) return;
                          setPlaylistItems([
                            ...playlistItems,
                            {
                              videoId: v.id,
                              videoTitle: v.title,
                              videoVersion: v.current_version || 'v1',
                              enabled: true,
                              startsAt: '',
                              expiresAt: '',
                              expiryPolicy: 'IMMEDIATE'
                            }
                          ]);
                          e.target.value = '';
                        }}
                      >
                        <option value="" disabled>
                          -- Chọn video thêm vào Playlist --
                        </option>
                        {videos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-3">
                      {playlistItems.map((it, idx) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              #{idx + 1} - {it.videoTitle || it.videoId}
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={it.enabled}
                                  onChange={(e) => {
                                    const copy = [...playlistItems];
                                    copy[idx].enabled = e.target.checked;
                                    setPlaylistItems(copy);
                                  }}
                                />
                                Bật phát
                              </label>
                              <button
                                onClick={() => setPlaylistItems(playlistItems.filter((_, i) => i !== idx))}
                                className="text-red-400 text-xs"
                              >
                                Gỡ
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <SchedulePicker
                              label="Bắt đầu phát (startsAt)"
                              value={it.startsAt}
                              placeholder="Có hiệu lực ngay"
                              onChange={(val) => {
                                const copy = [...playlistItems];
                                copy[idx].startsAt = val;
                                setPlaylistItems(copy);
                              }}
                            />

                            <SchedulePicker
                              label="Ngừng phát & Xóa cache (expiresAt)"
                              value={it.expiresAt}
                              placeholder="Vô thời hạn (Không hết hạn)"
                              isExpiry
                              onChange={(val) => {
                                const copy = [...playlistItems];
                                copy[idx].expiresAt = val;
                                setPlaylistItems(copy);
                              }}
                            />

                            <div className="space-y-1.5">
                              <label className="block text-slate-300 font-medium">Chính sách hết hạn</label>
                              <select
                                value={it.expiryPolicy}
                                onChange={(e) => {
                                  const copy = [...playlistItems];
                                  copy[idx].expiryPolicy = e.target.value;
                                  setPlaylistItems(copy);
                                }}
                                className="w-full bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-lg px-3 py-2 text-slate-200"
                              >
                                <option value="IMMEDIATE">Ngừng ngay & xóa đúng cache</option>
                                <option value="FINISH_CURRENT">Hoàn tất lượt đang phát rồi xóa cache</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-500 text-sm">Chọn một Playlist bên trái để cấu hình lịch phát.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'drive' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Drive Lưu Trữ Cloudflare R2</h2>

            {(() => {
              const totalLimitBytes = 10 * 1024 * 1024 * 1024; // 10 GB Free Tier
              const usedBytes = stats?.totalBytes || videos.reduce((acc, v) => acc + (v.size_bytes || 0), 0);
              const remainingBytes = Math.max(0, totalLimitBytes - usedBytes);
              const usedPercentage = Math.min(100, (usedBytes / totalLimitBytes) * 100);

              const usedMb = (usedBytes / (1024 * 1024)).toFixed(2);
              const remainingGb = (remainingBytes / (1024 * 1024 * 1024)).toFixed(2);
              const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);

              return (
                <div className="space-y-6">
                  {/* Storage Progress Card */}
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-slate-400">Dung lượng bộ nhớ Cloudflare R2</div>
                        <div className="text-2xl font-bold mt-1 text-white">
                          {usedGb} GB <span className="text-sm font-normal text-slate-400">/ 10.00 GB (Free Tier)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Còn lại trống</div>
                        <div className="text-xl font-bold text-emerald-400 mt-1">{remainingGb} GB</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          usedPercentage > 90
                            ? 'bg-red-500'
                            : usedPercentage > 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(1, usedPercentage)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Đã dùng: {usedPercentage.toFixed(1)}% ({usedMb} MB)</span>
                      <span>Hạn mức miễn phí: 10 GB (Không mất phí băng thông Egress)</span>
                    </div>
                  </div>

                  {/* Quota Specs Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                      <div className="text-xs text-slate-400">Tổng số tệp video</div>
                      <div className="text-2xl font-bold mt-1">{videos.length} video</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                      <div className="text-xs text-slate-400">Cước phí tải video (Egress)</div>
                      <div className="text-2xl font-bold mt-1 text-emerald-400">0 VNĐ / Miễn phí</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                      <div className="text-xs text-slate-400">Lượt ghi / Class A limit</div>
                      <div className="text-2xl font-bold mt-1">1.000.000 / tháng</div>
                    </div>
                  </div>

                  {/* Detailed File List */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 font-semibold text-sm">
                      Chi tiết các tệp đang chiếm dung lượng trên R2 Bucket
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800/60 text-slate-400">
                        <tr>
                          <th className="p-4">Tên Video</th>
                          <th className="p-4">Đường dẫn R2 Key</th>
                          <th className="p-4">Dung lượng</th>
                          <th className="p-4">Tỷ lệ chiếm Drive</th>
                          <th className="p-4">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {videos.map((v) => {
                          const fileMb = (v.size_bytes / (1024 * 1024)).toFixed(2);
                          const filePct = ((v.size_bytes / totalLimitBytes) * 100).toFixed(2);
                          return (
                            <tr key={v.id}>
                              <td className="p-4 font-medium">{v.title}</td>
                              <td className="p-4 font-mono text-xs text-slate-400">{v.r2_key}</td>
                              <td className="p-4 text-sky-300 font-medium">{fileMb} MB</td>
                              <td className="p-4 text-slate-400">{filePct}%</td>
                              <td className="p-4">
                                <button
                                  onClick={() => handleDeleteVideo(v.id)}
                                  className="text-red-400 hover:text-red-300 text-xs font-semibold"
                                >
                                  Xóa để giải phóng
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {videos.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-500">
                              Chưa có file nào trên kho lưu trữ R2.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
