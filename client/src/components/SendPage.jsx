import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  BarChart3,
  CheckCheck,
  CheckCircle2,
  CloudUpload,
  FileVideo,
  Film,
  Loader2,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  UploadCloud,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { uploadVideo } from '../lib/api.js';
import { fmtBytes, fmtDuration, fmtEta, store } from '../lib/store.js';
import HistoryPanel from './HistoryPanel.jsx';

const STAGES = [
  { id: 'upload', label: 'Unggah' },
  { id: 'compress', label: 'Kompres' },
  { id: 'send', label: 'Kirim' },
  { id: 'done', label: 'Selesai' },
];

const COMPRESS_MSGS = [
  'Ngompres video…',
  'Ngilangin noise…',
  'Ngatur bitrate…',
  'Ngebut ke HD…',
  'Sabar, lagi ngoding encode…',
  'Dikit lagi…',
];

/* ================= Counter angka ================= */
function AnimatedNumber({ value, className }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = to;
    if (from === to) return;
    const start = performance.now();
    const dur = 500;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
}

/* ================= Ring conic (animasi baru kompres) ================= */
function ConicRing({ percent, children }) {
  return (
    <div className="relative" style={{ width: 150, height: 150 }}>
      {/* gelombang pulsa di belakang */}
      <span className="absolute inset-0 rounded-full bg-brand/20" style={{ animation: 'wave-pulse 1.8s ease-out infinite' }} />
      <span className="absolute inset-0 rounded-full bg-fuchsia-500/15" style={{ animation: 'wave-pulse 1.8s ease-out 0.6s infinite' }} />
      <span className="absolute inset-0 rounded-full bg-cyan-400/15" style={{ animation: 'wave-pulse 1.8s ease-out 1.2s infinite' }} />
      {/* donut conic gradient */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, #ff2d55, #ffb454, #7faede, #ff2d55 ${percent * 3.6}deg, rgba(255,255,255,0.08) ${percent * 3.6}deg)`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 13px), black calc(100% - 12px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 13px), black calc(100% - 12px))',
        }}
      />
      {/* lingkaran dalam */}
      <div className="absolute inset-[13px] rounded-full bg-ink-900 shadow-inner" />
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ================= Tombol magnetik ================= */
function Magnetic({ children, strength = 10, className = '' }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16 });
  const sy = useSpring(y, { stiffness: 220, damping: 16 });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: 'inline-block' }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set(((e.clientX - (r.left + r.width / 2)) / r.width) * strength);
        y.set(((e.clientY - (r.top + r.height / 2)) / r.height) * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/* ================= Kartu statistik ================= */
function StatsRow() {
  const { history } = useApp();
  const success = history.filter((h) => h.status === 'success');
  if (!success.length) return null;
  const totalMB = success.reduce((a, h) => a + (h.sizeMB || 0), 0);
  const uniqueTargets = new Set(success.flatMap((h) => h.targets || [h.target])).size;

  const cards = [
    { icon: <BarChart3 className="h-4 w-4" />, label: 'Video Kekirim', value: success.length, suffix: '', color: 'text-brand' },
    { icon: <Film className="h-4 w-4" />, label: 'Total Data', value: totalMB, suffix: 'MB', color: 'text-fuchsia-400' },
    { icon: <Users className="h-4 w-4" />, label: 'Nomor Tujuan', value: uniqueTargets, suffix: '', color: 'text-cyan-300' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
          className="card !rounded-xl p-3 text-center sm:p-4"
        >
          <div className={`mx-auto grid h-8 w-8 place-items-center rounded-lg bg-white/5 ${c.color}`}>{c.icon}</div>
          <div className="mt-1.5 font-display text-lg font-bold text-white sm:text-xl">
            <AnimatedNumber value={Math.round(c.value)} />{c.suffix}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

/* ================= Halaman utama ================= */
export default function SendPage() {
  const { conn, socket, addToast, setPage, effectiveConnected, cfg } = useApp();
  const [file, setFile] = useState(null);
  const [upInfo, setUpInfo] = useState(null);
  const [upPercent, setUpPercent] = useState(0);
  const [upPhase, setUpPhase] = useState('idle');
  const [target, setTarget] = useState(store.getTarget());
  const [caption, setCaption] = useState(store.getCaption());
  const [quality, setQuality] = useState(store.getQuality());
  const [phase, setPhase] = useState('idle');
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState({ percent: 0, etaSec: null, speed: null });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [cMsgIdx, setCMsgIdx] = useState(0);
  const fileInputRef = useRef(null);
  const confettiFired = useRef(false);

  const connected = effectiveConnected;

  // Preview URL
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  /* ---------- Socket events ---------- */
  useEffect(() => {
    if (!socket) return;
    const onJobStart = () => {
      confettiFired.current = false;
      setPhase('processing');
      setStageIdx(0);
      setProgress({ percent: 0, etaSec: null, speed: null });
      setError(null);
      setResult(null);
    };
    const onCompressStart = () => {
      setPhase('processing');
      setStageIdx(1);
      setProgress({ percent: 0, etaSec: null, speed: null });
    };
    const onCompressProgress = (d) => {
      setStageIdx(1);
      setProgress({ percent: d.percent, etaSec: d.etaSec, speed: d.speed });
    };
    const onCompressDone = () => setStageIdx(2);
    const onSendStart = () => {
      setStageIdx(2);
      setProgress({ percent: -1 });
    };
    const onSendDone = (d) => {
      setStageIdx(3);
      setPhase('success');
      setResult(d);
      fireConfetti();
    };
    const onSendError = (e) => {
      if (e?.code === 'CANCELED') {
        setPhase('idle');
        addToast('info', 'Dibatalkan', 'Proses dihentikan.');
      } else {
        setPhase('error');
        setError(e?.message || 'Ada yang error, coba lagi ya.');
      }
    };
    socket.on('job:start', onJobStart);
    socket.on('compress:start', onCompressStart);
    socket.on('compress:progress', onCompressProgress);
    socket.on('compress:done', onCompressDone);
    socket.on('send:start', onSendStart);
    socket.on('send:done', onSendDone);
    socket.on('send:error', onSendError);
    return () => {
      socket.off('job:start', onJobStart);
      socket.off('compress:start', onCompressStart);
      socket.off('compress:progress', onCompressProgress);
      socket.off('compress:done', onCompressDone);
      socket.off('send:start', onSendStart);
      socket.off('send:done', onSendDone);
      socket.off('send:error', onSendError);
    };
  }, [socket, addToast]);

  // Rotasi teks kompres
  useEffect(() => {
    if (stageIdx !== 1) return;
    const t = setInterval(() => setCMsgIdx((i) => (i + 1) % COMPRESS_MSGS.length), 2200);
    return () => clearInterval(t);
  }, [stageIdx]);

  // Judul tab browser
  useEffect(() => {
    const base = 'KyyPureStatus';
    if (phase === 'processing') {
      if (stageIdx === 1) document.title = `${progress.percent}% Ngompres… | ${base}`;
      else if (stageIdx === 2) document.title = `Ngirim… | ${base}`;
      else document.title = `Nyiapin… | ${base}`;
    } else {
      document.title = base;
    }
    return () => { document.title = base; };
  }, [phase, stageIdx, progress.percent]);

  /* ---------- Confetti (star + sparkle) ---------- */
  const fireConfetti = () => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const colors = ['#ff2d55', '#ffb454', '#7faede', '#ffffff'];
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors });
    setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.5 }, colors, shapes: ['star'], scalar: 1.1, startVelocity: 40 }), 250);
    setTimeout(() => confetti({ particleCount: 45, spread: 100, origin: { y: 0.7 }, colors, scalar: 0.8 }), 500);
    setTimeout(() => confetti({ particleCount: 35, spread: 140, origin: { y: 0.6 }, colors, shapes: ['star'], scalar: 0.7, startVelocity: 55 }), 750);
  };

  /* ---------- Upload ---------- */
  const handleFile = async (f) => {
    if (!f || phase === 'processing') return;
    const maxMB = window.CONFIG?.maxUploadMB || 100;
    if (f.size > maxMB * 1024 * 1024) {
      addToast('error', 'Kegedean bro', `Maksimal ${maxMB} MB.`);
      return;
    }
    if (!f.type.startsWith('video/')) {
      addToast('error', 'Bukan video', 'Pilih file video dong (MP4/MOV/MKV/AVI/WebM/3GP).');
      return;
    }
    setFile(f);
    setUpPhase('uploading');
    setUpPercent(0);
    setUpInfo(null);
    setPhase('idle');
    setError(null);
    setResult(null);
    try {
      const res = await uploadVideo(f, setUpPercent);
      setUpInfo(res);
      setUpPhase('ready');
      addToast('success', 'Video masuk nih', `${res.plan.profileLabel} · ${res.plan.width}x${res.plan.height} · ±${res.plan.estimatedMB} MB`);
    } catch (err) {
      setUpPhase('idle');
      setFile(null);
      addToast('error', 'Gagal upload', err.message);
    }
  };

  const resetAll = () => {
    setFile(null);
    setUpInfo(null);
    setUpPhase('idle');
    setPhase('idle');
    setStageIdx(0);
    setProgress({ percent: 0, etaSec: null, speed: null });
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ---------- Proses ---------- */
  const startProcess = () => {
    if (!socket || !upInfo?.uploadId || phase === 'processing') return;
    const t = target.trim();
    if (!t) {
      addToast('error', 'Nomornya kosong', 'Isi dulu nomor tujuannya (contoh: 6281234567890).');
      return;
    }
    socket.emit('video:process', {
      uploadId: upInfo.uploadId,
      targets: t,
      caption: caption.trim(),
      quality,
    });
  };

  const cancelProcess = () => socket?.emit('video:cancel');

  const onResend = useCallback(
    (entry) => {
      if (!socket || phase === 'processing') return;
      const t = target.trim() || entry.target;
      socket.emit('video:resend', { id: entry.id, targets: t, caption: caption.trim() });
    },
    [socket, phase, target, caption]
  );

  /* ---------- Belum terhubung ---------- */
  if (!connected) {
    return (
      <div className="card p-10 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"
        >
          <Zap className="h-6 w-6" />
        </motion.div>
        <h2 className="font-display mt-4 text-2xl font-bold text-white">WA-nya Belum Nyambung</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
          Santai, sambungin dulu nomor WA lewat QR / pairing code biar bisa kirim video.
        </p>
        <Magnetic>
          <button className="btn-primary mt-5" onClick={() => setPage('connect')}>
            Ke Halaman Koneksi <ArrowRight className="h-4 w-4" />
          </button>
        </Magnetic>
      </div>
    );
  }

  const plan = upInfo?.plan;
  // Profil yang dipilih user (untuk tampilan rencana)
  const chosenProfile = cfg?.profiles?.find((p) => p.key === quality);
  const displayProfile = quality !== 'auto' && chosenProfile ? chosenProfile : null;
  const displayLabel = displayProfile?.label || plan?.profileLabel || '';
  const displayEstMB = displayProfile && plan
    ? Math.max(1, Math.round((displayProfile.bitrateMbps * plan.durationSec) / 8))
    : plan?.estimatedMB;

  return (
    <div className="space-y-4">
      {/* ====== Stats dashboard ====== */}
      <StatsRow />

      {/* ====== STEP 1: Upload ====== */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card p-6 sm:p-8">
        <SectionTitle step={1} title="Upload Video" subtitle={`Max ${window.CONFIG?.maxUploadMB || 100} MB · MP4/MOV/MKV/AVI/WebM/3GP`} />

        <AnimatePresence mode="wait">
          {upPhase === 'idle' && (
            <motion.div
              key="drop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`group mt-5 grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 ${
                dragOver
                  ? 'border-brand/70 bg-brand/10 scale-[1.02] shadow-glow'
                  : 'border-white/10 bg-white/[0.02] hover:border-brand/40 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={dragOver ? { y: [0, -10, 0], rotate: [0, -4, 4, 0] } : { y: [0, -7, 0] }}
                  transition={{ duration: dragOver ? 0.9 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand/20 to-fuchsia-500/20 text-brand shadow-glow transition-transform duration-300 group-hover:scale-110"
                >
                  <UploadCloud className="h-10 w-10" />
                </motion.div>
                <div>
                  <div className="font-display text-lg font-bold text-white">Seret video lu ke sini</div>
                  <div className="mt-1 text-xs text-slate-500">atau tinggal klik aja</div>
                </div>
              </div>
            </motion.div>
          )}

          {upPhase === 'uploading' && (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <div className="flex items-center justify-center gap-6">
                <div className="relative" style={{ width: 110, height: 110 }}>
                  <span className="absolute inset-0 rounded-full bg-brand/20" style={{ animation: 'wave-pulse 1.8s ease-out infinite' }} />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(from 0deg, #ff2d55, #ffb454, #7faede ${upPercent * 3.6}deg, rgba(255,255,255,0.08) ${upPercent * 3.6}deg)`,
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black calc(100% - 11px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black calc(100% - 11px))',
                    }}
                  />
                  <div className="absolute inset-[12px] rounded-full bg-ink-900" />
                  <div className="absolute inset-0 grid place-items-center">
                    <CloudUpload className="h-7 w-7 text-brand" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">
                    Ngunggah video… <AnimatedNumber value={upPercent} className="grad-text font-black" />%
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      className="relative h-full rounded-full bg-gradient-to-r from-brand via-fuchsia-500 to-cyan-400"
                      animate={{ width: `${Math.max(4, upPercent)}%` }}
                      transition={{ ease: 'easeOut', duration: 0.35 }}
                    >
                      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent bg-[length:200%_100%]" />
                    </motion.div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{fmtBytes(file?.size || 0)} · sabar ya</p>
                </div>
              </div>
            </motion.div>
          )}

          {upPhase === 'ready' && upInfo && (
            <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 space-y-4">
              {/* Preview */}
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                {previewUrl && <video src={previewUrl} controls className="max-h-80 w-full object-contain" />}
              </div>

              {/* Info + Rencana + Pilih kualitas */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <FileVideo className="h-4 w-4 text-brand" /> <span className="truncate">{upInfo.meta.originalName}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                    <span className="pill">{fmtBytes(file.size)}</span>
                    <span className="pill">{fmtDuration(plan.durationSec)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-brand/25 bg-brand/[0.05] p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sparkles className="h-4 w-4 text-brand" /> Rencana Kompresi
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="pill border-brand/30 bg-brand/10 text-brand">{displayLabel}</span>
                    <span className="pill">{plan.width}x{plan.height}</span>
                    <span className="pill">{plan.fps} fps</span>
                    <span className="pill">±{displayEstMB} MB</span>
                  </div>
                  {plan.trimNote && <p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">⚠ {plan.trimNote}</p>}
                </div>
              </div>

              {/* Selector kualitas manual */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pilih Kualitas (opsional)</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[{ key: 'auto', label: '⚡ Auto' }, ...(cfg?.profiles || []).map((p) => ({ key: p.key, label: p.label }))].map((q) => (
                    <button
                      key={q.key}
                      onClick={() => { setQuality(q.key); store.setQuality(q.key); }}
                      disabled={phase === 'processing'}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                        quality === q.key
                          ? 'border-brand/60 bg-brand/15 text-brand shadow-glow'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Auto = otomatis pilih sesuai durasi (≤30 dtk → 1080p, ≤60 dtk → 720p).</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button className="btn-ghost text-xs" onClick={resetAll} disabled={phase === 'processing'}>
                  <X className="h-3.5 w-3.5" /> Ganti Video
                </button>
                <motion.span
                  className="text-[11px] font-medium text-slate-400"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  Udah siap, gas ↓
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </motion.div>

      {/* ====== STEP 2: Tujuan ====== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="card p-6 sm:p-8"
      >
        <SectionTitle step={2} title="Nomor Tujuan" subtitle="Bisa lebih dari satu — pisah pake koma. Biasanya nomor utama lu sendiri" />
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="input font-mono"
            placeholder="6281234567890, 6289876543210"
            inputMode="numeric"
            value={target}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9,\s]/g, ''); setTarget(v); store.setTarget(v); }}
            disabled={phase === 'processing'}
          />
          <input
            className="input sm:w-56"
            placeholder="Caption (opsional)"
            value={caption}
            onChange={(e) => { setCaption(e.target.value); store.setCaption(e.target.value); }}
            disabled={phase === 'processing'}
          />
        </div>
        {target.split(/[,;\s]+/).filter(Boolean).length > 1 && (
          <div className="mt-2 text-[11px] text-cyan-300">
            🎯 {target.split(/[,;\s]+/).filter(Boolean).length} nomor tujuan siap kirim
          </div>
        )}
      </motion.div>

      {/* ====== STEP 3: Proses ====== */}
      {phase !== 'success' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          className="card p-6 sm:p-8"
        >
          {phase === 'processing' && (
            <div className="mb-6">
              {/* Stepper dengan pill aktif */}
              <div className="flex items-center justify-between">
                {STAGES.map((s, i) => {
                  const done = i < stageIdx;
                  const active = i === stageIdx;
                  return (
                    <div key={s.id} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center gap-2">
                        {active ? (
                          <motion.div layoutId="stage-pill" className="relative flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-fuchsia-500 px-4 py-2 shadow-glow">
                            {i === 1 ? <Film className="h-3.5 w-3.5 text-white" /> : i === 2 ? <Send className="h-3.5 w-3.5 text-white" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />}
                            <span className="text-[11px] font-black uppercase tracking-wide text-white">{s.label}</span>
                          </motion.div>
                        ) : (
                          <motion.div
                            className={`grid h-9 w-9 place-items-center rounded-full border text-xs font-bold transition-all ${
                              done ? 'border-brand/50 bg-brand/15 text-brand' : 'border-white/10 bg-white/5 text-slate-500'
                            }`}
                          >
                            {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                          </motion.div>
                        )}
                        {!active && (
                          <span className={`text-[10px] font-semibold ${done ? 'text-brand' : 'text-slate-600'}`}>{s.label}</span>
                        )}
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className="mx-1.5 mb-6 h-0.5 flex-1 overflow-hidden rounded bg-white/5">
                          <motion.div
                            className="h-full rounded bg-gradient-to-r from-brand to-fuchsia-500"
                            animate={{ width: done ? '100%' : '0%' }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ====== KOMPRES: conic ring + wave ====== */}
              {stageIdx === 1 && (
                <div className="mt-7 flex flex-col items-center gap-6 rounded-2xl border border-brand/20 bg-brand/[0.04] p-7 sm:flex-row sm:justify-center">
                  <ConicRing percent={progress.percent}>
                    <div className="flex flex-col items-center gap-0.5">
                      <AnimatedNumber value={progress.percent} className="font-display text-3xl font-black text-white" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">persen</span>
                    </div>
                  </ConicRing>
                  <div className="w-full max-w-xs sm:w-60">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={cMsgIdx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-2 text-sm font-semibold text-white"
                      >
                        <Film className="h-4 w-4 shrink-0 text-brand" /> {COMPRESS_MSGS[cMsgIdx]}
                      </motion.div>
                    </AnimatePresence>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="relative h-full rounded-full bg-gradient-to-r from-brand via-fuchsia-500 to-cyan-400 bg-[length:200%_100%] animate-gradientX"
                        animate={{ width: `${Math.max(4, progress.percent)}%` }}
                        transition={{ ease: 'easeOut', duration: 0.4 }}
                      >
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent bg-[length:200%_100%]" />
                      </motion.div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{progress.etaSec != null ? `sisa ±${fmtEta(progress.etaSec)}` : 'ngitung…'}</span>
                      <span className="font-mono">{progress.speed ? `${progress.speed.toFixed(1)}x` : ''}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Sparkles className="h-3 w-3 text-fuchsia-400" />
                      Kualitas dipilih: {quality === 'auto' ? 'Auto' : displayLabel}
                    </div>
                  </div>
                </div>
              )}

              {/* ====== KIRIM: chat bubble WA ====== */}
              {stageIdx === 2 && (
                <div className="mt-7 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-7">
                  <div className="mx-auto max-w-xs">
                    <div className="text-center text-sm font-bold text-white">Ngirim video ke WA…</div>
                    {/* bubble chat */}
                    <motion.div
                      initial={{ scale: 0, y: 14, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.15 }}
                      className="relative mt-5 rounded-2xl rounded-tl-sm border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 p-4 shadow-card"
                    >
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                      >
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                            <Film className="h-4 w-4" />
                          </div>
                          <span className="truncate">{upInfo?.meta?.originalName || 'video.mp4'}</span>
                        </div>
                        <div className="mt-1.5 pl-10 text-[10px] text-slate-500">
                          {result?.meta?.sizeMB || '—'} MB · {result?.meta?.resolution || '—'}
                        </div>
                      </motion.div>
                      {/* centang: tunggal → ganda */}
                      <div className="absolute bottom-2.5 right-3 flex items-center gap-1">
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="text-[10px] text-slate-500">
                          dikirim ✓
                        </motion.span>
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                          <Send className="h-3 w-3 -scale-x-100 text-cyan-300" />
                        </motion.span>
                        <motion.span
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 2.2, type: 'spring', stiffness: 300, damping: 15 }}
                        >
                          <CheckCheck className="h-3.5 w-3.5 text-brand" />
                        </motion.span>
                      </div>
                    </motion.div>
                    {/* titik berjalan di bawah */}
                    <div className="mt-4 flex items-center justify-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-cyan-300"
                          animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                      <span className="ml-2 text-[11px] text-slate-500">
                        ke {target.split(/[,;\s]+/).filter(Boolean).length} nomor · ±10-30 detik
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Indeterminate awal */}
              {stageIdx === 0 && (
                <div className="mt-7 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-300">
                  <Loader2 className="h-5 w-5 animate-spin text-brand" /> Nyiapin proses…
                </div>
              )}

              <Magnetic strength={4} className="w-full">
                <button className="btn-danger mt-6 w-full" onClick={cancelProcess}>
                  <X className="h-4 w-4" /> Batalin Aja
                </button>
              </Magnetic>
            </div>
          )}

          {phase === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4"
            >
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <div className="text-sm font-bold text-red-300">Gagal kirim :(</div>
                <div className="mt-0.5 text-xs text-red-200/80">{error}</div>
              </div>
            </motion.div>
          )}

          {phase !== 'processing' && (
            <Magnetic className="w-full">
              <button
                className="btn-primary w-full !py-4 text-base"
                onClick={startProcess}
                disabled={upPhase !== 'ready'}
              >
                {phase === 'error' ? <><RefreshCw className="h-5 w-5" /> Coba Lagi</> : <><Send className="h-5 w-5" /> Gas, Compress &amp; Kirim!</>}
              </button>
            </Magnetic>
          )}
        </motion.div>
      )}

      {/* ====== SUCCESS: rocket + badge ====== */}
      <AnimatePresence>
        {phase === 'success' && result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="card overflow-hidden"
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-brand via-fuchsia-500 to-cyan-400" />
            <div className="p-6 text-center sm:p-10">
              {/* Roket naik + badge */}
              <div className="relative mx-auto h-28 w-28">
                {/* trail roket */}
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-fuchsia-400"
                    style={{ animation: `trail 1.1s ease-out ${i * 0.22}s infinite` }}
                  />
                ))}
                <motion.div
                  initial={{ y: 70, opacity: 0, rotate: 20 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand via-fuchsia-500 to-cyan-400 shadow-glow">
                    <Rocket className="h-10 w-10 text-white" />
                  </div>
                </motion.div>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-brand/20"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
                />
              </div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="font-display mt-4 text-3xl font-bold tracking-tight text-white"
              >
                Video Kekirim! 🎉
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-300"
              >
                Udah nyampe ke <b className="font-mono text-brand">{result.targets?.join(', ') || result.target}</b>{' '}
                ({result.meta.sizeMB} MB · {result.meta.resolution} · {result.meta.profileLabel}).
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="mx-auto mt-5 max-w-md rounded-2xl border border-brand/25 bg-brand/[0.06] p-4 text-left"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-brand">Nih step di HP lu:</div>
                <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                  <li>1️⃣ Buka WA di HP → buka chat dari nomor pengirim</li>
                  <li>2️⃣ <b className="text-white">Tekan tahan</b> videonya</li>
                  <li>3️⃣ Pilih <b className="text-white">Teruskan</b> → <b className="text-white">Status</b></li>
                  <li>4️⃣ Gas post! Hasilnya auto tajam HD soalnya udah di-encode premium 📱✨</li>
                </ol>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-6 flex flex-wrap justify-center gap-2"
              >
                <Magnetic>
                  <button className="btn-primary" onClick={resetAll}>
                    <UploadCloud className="h-4 w-4" /> Kirim Video Lagi
                  </button>
                </Magnetic>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== Riwayat ====== */}
      <HistoryPanel onResend={onResend} busy={phase === 'processing'} />
    </div>
  );
}

function SectionTitle({ step, title, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        whileHover={{ rotate: 8, scale: 1.08 }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-fuchsia-500 text-base font-black text-white shadow-glow"
      >
        {step}
      </motion.div>
      <div>
        <h3 className="font-display text-base font-bold text-white">{title}</h3>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}
