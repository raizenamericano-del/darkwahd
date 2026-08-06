import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import {
  Download, Play, AlertCircle, Swords,
  Music2, Instagram, Youtube, Facebook, Wand2,
} from 'lucide-react';

/* ============================================================
 * Downloader v4.1 — TikTok HD · Instagram · YouTube · Facebook
 * Scraper: server/scraper-dk.js (ported dari repo toolkuufinalltest)
 * ============================================================ */

const TABS = [
  { key: '', icon: Wand2, label: 'Auto', hint: 'Tempel link apa aja — platform dideteksi otomatis' },
  { key: 'tiktok', icon: Music2, label: 'TikTok', hint: 'https://www.tiktok.com/@user/video/… atau vt.tiktok.com/…' },
  { key: 'instagram', icon: Instagram, label: 'Instagram', hint: 'https://www.instagram.com/reel/… atau /p/… atau story' },
  { key: 'youtube', icon: Youtube, label: 'YouTube', hint: 'https://youtu.be/… atau youtube.com/watch?v=…' },
  { key: 'facebook', icon: Facebook, label: 'Facebook', hint: 'https://facebook.com/… atau fb.watch/…' },
];

const QUALITY_LABEL = {
  HD: '🎬 VIDEO HD',
  NoWM: '🎬 NO WATERMARK',
  WM: '🎬 WITH WATERMARK',
  MP3: '🎵 AUDIO MP3',
  MP4: '🎬 VIDEO MP4',
};

function extractMedias(res) {
  const meds = [];
  if (res.medias && Array.isArray(res.medias)) {
    res.medias.forEach((m) => {
      const url = typeof m === 'string' ? m : (m.url || m.src || m.link || '');
      const type = m.type || (url.match(/\.(mp3|m4a|aac)\b/i) ? 'audio' : url.match(/\.(mp4|mov|mkv|webm)\b/i) ? 'video' : 'file');
      if (url) meds.push({ url, type, quality: m.quality, label: QUALITY_LABEL[m.quality] || m.label || (type === 'video' ? 'VIDEO HD' : type === 'audio' ? 'AUDIO' : 'FILE') });
    });
  } else if (res.media && Array.isArray(res.media)) {
    res.media.forEach((m) => {
      const url = typeof m === 'string' ? m : (m.url || m.direct || m.src || '');
      const type = m.type || (url.match(/\.(mp3|m4a)\b/i) ? 'audio' : url.match(/\.(mp4|mov)\b/i) ? 'video' : 'file');
      if (url) meds.push({ url, type, quality: m.quality, label: QUALITY_LABEL[m.quality] || (type === 'video' ? 'VIDEO HD' : type === 'audio' ? 'AUDIO' : 'MEDIA') });
    });
  } else if (res.url && typeof res.url === 'string') {
    const url = res.url;
    const type = url.match(/\.(mp4|mov|mkv|webm)\b/i) ? 'video' : url.match(/\.(mp3|m4a)\b/i) ? 'audio' : 'file';
    meds.push({ url, type, label: type === 'video' ? 'VIDEO HD' : type === 'audio' ? 'AUDIO' : 'FILE' });
  }
  if (res.image && typeof res.image === 'string') meds.push({ url: res.image, type: 'image', label: 'PREVIEW', isThumb: true });
  if (res.thumbnail && typeof res.thumbnail === 'string' && !meds.some((m) => m.type === 'image')) {
    meds.push({ url: res.thumbnail, type: 'image', label: 'PREVIEW', isThumb: true });
  }
  if (meds.length === 0 && res) {
    Object.keys(res).forEach((k) => {
      const v = res[k];
      if (typeof v === 'string' && v.match(/^https?:\/\//)) {
        const type = v.match(/\.(mp4|mov|mkv|webm)\b/i) ? 'video' : v.match(/\.(jpg|jpeg|png|webp)\b/i) ? 'image' : 'file';
        if (type === 'image') meds.unshift({ url: v, type: 'image', label: 'PREVIEW', isThumb: true });
        else meds.push({ url: v, type, label: type === 'video' ? 'VIDEO HD' : 'FILE' });
      }
    });
  }
  return meds;
}

function guessFilename(url, type) {
  try {
    const u = new URL(url);
    const basename = u.pathname.split('/').pop();
    if (basename && basename.includes('.')) return basename;
  } catch (_) {}
  return type === 'video' ? 'video_hd.mp4' : type === 'audio' ? 'audio.mp3' : 'download';
}

export default function DownloadPage() {
  const [tab, setTab] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setRes(null); setLoading(true);
    try {
      const data = await api('/api/downloader', {
        method: 'POST',
        body: JSON.stringify({ url, platform: tab }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (data.status) setRes(data);
      else setErr(data.error || 'Gagal mengambil data');
    } catch (e) {
      setErr('Server error / scraper gagal');
    } finally {
      setLoading(false);
    }
  };

  const medias = useMemo(() => (res ? extractMedias(res) : []), [res]);
  const previewMedia = useMemo(() => {
    const vid = medias.find((m) => m.type === 'video' && !m.isThumb);
    if (vid) return vid;
    const img = medias.find((m) => m.type === 'image' && !m.isThumb);
    if (img) return img;
    return medias.find((m) => !m.isThumb) || null;
  }, [medias]);

  async function downloadFile(uri, filename) {
    setDownloadingId(uri);
    try {
      const resp = await fetch(uri, { method: 'GET', mode: 'cors' });
      if (!resp.ok && resp.status !== 0) throw new Error('Gagal fetch');
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || guessFilename(uri, 'video');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (_) {
      window.open(uri, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingId(null);
    }
  }

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="knight-frame scanline p-6 shadow-2xl shadow-brand/20 sm:p-8"
      >
        <div className="mb-5 flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-ember-500 shadow-lg shadow-brand/40"
          >
            <Swords className="h-5 w-5 text-white" />
          </motion.div>
          <div>
            <h2 className="font-display text-2xl font-extrabold leading-none tracking-wide text-white">
              <span className="dk-title grad-text" data-text="Downloader">Downloader</span>
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-400">TikTok HD · Instagram · YouTube · Facebook</p>
          </div>
        </div>

        {/* Tab platform */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key || 'auto'}
                onClick={() => { setTab(t.key); setRes(null); setErr(''); }}
                className={`relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${active ? 'text-ink-950' : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'}`}
              >
                {active && (
                  <motion.span
                    layoutId="dl-tab"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand to-ember-400 shadow-glow"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5" />
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={activeTab.hint}
            className="w-full rounded-xl border border-white/15 bg-ink-950/70 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none ring-2 ring-transparent transition focus:border-brand/60 focus:ring-brand/20"
            required
          />
          <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
            {loading ? (
              <>
                <span className="eq !h-4"><span /><span /><span /><span /><span /></span>
                Menjarah media…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Media
              </>
            )}
          </button>
        </form>

        {err && (
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/20"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{err}</span>
          </motion.div>
        )}

        {res && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="mt-6 overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10"
          >
            <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-brand/15 to-ember-500/10 px-5 py-4">
              <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-brand">
                {res.platform || activeTab.label}
              </span>
              <h3 className="truncate font-bold text-white">{res.title || res.desc || 'Media ditemukan'}</h3>
            </div>

            <div className="p-5">
              {previewMedia && (
                <div className="mb-5 overflow-hidden rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/40">
                  {previewMedia.type === 'video' ? (
                    <video
                      src={previewMedia.url}
                      controls
                      preload="metadata"
                      className="w-full bg-black"
                      poster={medias.find((m) => m.type === 'image' && !m.isThumb)?.url || ''}
                      style={{ maxHeight: 420, objectFit: 'cover' }}
                    />
                  ) : previewMedia.type === 'image' ? (
                    <img src={previewMedia.url} alt="preview" className="w-full object-cover" style={{ maxHeight: 420 }} />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-gradient-to-br from-ink-900 to-ink-950 text-slate-500">
                      <Play className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {medias.filter((m) => !m.isThumb).map((m, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => downloadFile(m.url, guessFilename(m.url, m.type))}
                    disabled={downloadingId === m.url}
                    className="group relative flex items-center gap-3 rounded-xl bg-gradient-to-br from-white/[0.07] to-white/[0.03] px-4 py-3 text-left ring-1 ring-white/10 transition hover:brightness-110 hover:ring-brand/50 active:scale-[0.99]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-brand to-ember-500 shadow-lg shadow-brand/25 transition group-hover:shadow-glow">
                      {m.type === 'video' ? <Play className="h-4 w-4 text-white" /> : m.type === 'audio' ? <Music2 className="h-4 w-4 text-white" /> : <Download className="h-4 w-4 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold tracking-tight text-white">{m.label}</div>
                      <div className="truncate text-[11px] font-medium text-slate-300/70">{guessFilename(m.url, m.type)}</div>
                      {m.quality && (
                        <div className="mt-0.5 inline-block rounded bg-ember-400/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-ember-300">
                          {m.quality}
                        </div>
                      )}
                    </div>
                    {downloadingId === m.url ? (
                      <span className="text-xs font-bold text-ember-300">Downloading...</span>
                    ) : (
                      <Download className="h-4 w-4 text-slate-400 transition group-hover:scale-110 group-hover:text-white" />
                    )}
                  </motion.button>
                ))}
              </div>

              {medias.filter((m) => !m.isThumb).length === 0 && (
                <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/20">Tidak ada link media yang ditemukan.</div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
