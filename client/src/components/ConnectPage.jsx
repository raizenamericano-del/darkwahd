import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  Loader2,
  LogOut,
  Phone,
  QrCode,
  RefreshCw,
  Smartphone,
  Unplug,
} from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import BanWarning from './BanWarning.jsx';

const QR_TTL = 55;

export default function ConnectPage() {
  const { conn, setPage, addToast } = useApp();
  const [method, setMethod] = useState('qr');
  const [busy, setBusy] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [pairNumber, setPairNumber] = useState('');
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL);
  const [requestingQr, setRequestingQr] = useState(false);
  const connState = conn?.state || 'idle';
  const connected = connState === 'connected';

  const requestQr = useCallback(async () => {
    setRequestingQr(true);
    try {
      await api('/api/connect/qr', { method: 'POST' });
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    } finally {
      setRequestingQr(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (method === 'qr' && !connected && !busy) requestQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, connected]);

  useEffect(() => {
    if (method !== 'qr' || connected) return;
    setQrSecondsLeft(QR_TTL);
    const t = setInterval(() => setQrSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [method, connected, connState, conn?.qr]);

  useEffect(() => {
    if (qrSecondsLeft === 0 && method === 'qr' && !connected) requestQr();
  }, [qrSecondsLeft, method, connected, requestQr]);

  useEffect(() => {
    if (connState !== 'pairing') setPairCode('');
  }, [connState]);

  const requestPairing = async () => {
    setBusy(true);
    setPairCode('');
    try {
      const res = await api('/api/connect/pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: pairNumber }),
      });
      setPairCode(res.code);
      addToast('success', 'Pairing Code aman', 'Masukin kode-nya di WA: Setelan → Perangkat Tertaut.');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairCode);
      addToast('success', 'Ke-salin', 'Pairing code udah di-copy.');
    } catch {
      addToast('info', 'Salin manual', `Kodenya: ${pairCode}`);
    }
  };

  const doDisconnect = async () => {
    try {
      await api('/api/disconnect', { method: 'POST' });
      addToast('info', 'Diputus', 'Koneksi diputus, session aman kok.');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  const doLogout = async () => {
    if (!window.confirm('Logout = session kehapus. Nanti harus scan ulang loh. Lanjut?')) return;
    try {
      await api('/api/logout', { method: 'POST' });
      addToast('success', 'Udah Logout', 'Session WA dihapus.');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  /* ================= Connected ================= */
  if (connected) {
    return (
      <div className="space-y-4">
        <Hero />
        <BanWarning />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-brand via-fuchsia-500 to-cyan-400" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative h-24 w-24">
                <span className="absolute inset-0 rounded-3xl bg-brand/10" style={{ animation: 'radar 2.4s ease-out infinite' }} />
                <span className="absolute inset-0 rounded-3xl bg-brand/10" style={{ animation: 'radar 2.4s ease-out 0.8s infinite' }} />
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
                  className="relative grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-brand/25 to-fuchsia-500/20 text-brand"
                >
                  <Check className="h-11 w-11" strokeWidth={2.5} />
                </motion.div>
              </div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <h2 className="font-display text-2xl font-bold tracking-tight text-white">Nyambung nih! 🎉</h2>
                <p className="mt-1 text-sm text-slate-400">Session ke-save permanen — gak perlu scan ulang.</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/10 px-4 py-2.5 font-mono text-lg font-bold tracking-wider text-brand"
              >
                <Phone className="h-4 w-4" />
                {conn.phone || '—'}
              </motion.div>
              {conn.mock && !conn.realSession && (
                <div className="rounded-lg bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300">
                  MODE UJI — koneksi cuma simulasi, gak beneran
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button className="btn-primary" onClick={() => setPage('send')}>
                  Gas, Kirim Video <ArrowRight className="h-4 w-4" />
                </button>
                <button className="btn-ghost" onClick={doDisconnect}>
                  <Unplug className="h-4 w-4" /> Putusin
                </button>
                <button className="btn-danger" onClick={doLogout}>
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <StepList state={connState} phone={conn.phone} />
      </div>
    );
  }

  /* ================= Connecting / QR / Pairing ================= */
  return (
    <div className="space-y-4">
      <Hero />
      <BanWarning />

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5">
        {[
          { id: 'qr', label: 'QR Code', icon: <QrCode className="h-4 w-4" />, desc: 'Scan dari HP' },
          { id: 'pairing', label: 'Pairing Code', icon: <Link2 className="h-4 w-4" />, desc: 'Kode 8 digit' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={`relative rounded-xl px-3 py-2.5 text-center transition ${method === m.id ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {method === m.id && (
              <motion.div layoutId="method-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand to-fuchsia-500 shadow-glow" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2 text-sm font-bold">
              {m.icon} {m.label}
            </span>
            <span className={`relative z-10 block text-[10px] ${method === m.id ? 'text-white/80' : 'text-slate-500'}`}>{m.desc}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {method === 'qr' ? (
          <motion.div key="qr" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <QrPanel
              qr={connState === 'qr' ? conn?.qr : null}
              requesting={requestingQr}
              onRefresh={requestQr}
              secondsLeft={qrSecondsLeft}
              state={connState}
            />
          </motion.div>
        ) : (
          <motion.div key="pairing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <PairingPanel
              number={pairNumber}
              setNumber={setPairNumber}
              busy={busy}
              code={pairCode}
              onRequest={requestPairing}
              onCopy={copyCode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <StepList state={connState} />
    </div>
  );
}

/* ================= Hero 3D tilt ================= */
function Hero() {
  const ref = useRef(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 18 });
  const sry = useSpring(ry, { stiffness: 140, damping: 18 });

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rx.set(py * -7);
    ry.set(px * 9);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => { rx.set(0); ry.set(0); }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-6 py-10 text-center sm:py-12"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-brand/15 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-16 right-0 h-40 w-56 rounded-full bg-fuchsia-500/10 blur-[80px]" />
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          KyyPureStatus · by KyyDevv
        </div>
        <h1 className="font-display mt-4 text-4xl font-bold leading-[1.05] tracking-wide text-white sm:text-5xl">
          <span className="dk-title" data-text="Status HD.">Status HD.</span>
          <br />
          <span className="dk-title grad-text bg-[length:200%_auto] animate-gradientX" data-text="Anti Pecah.">
            Anti Pecah.
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
          Kirim video ke WA lu sendiri, terus tinggal <b className="text-slate-200">teruskan ke Status</b> — hasilnya
          tajam HD, bukan hasil kompres ulang dari galeri. Simpel kan? 🔥
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <span className="pill border-brand/30 bg-brand/10 text-brand">≤30 dtk → 1080p</span>
          <span className="pill border-cyan-400/30 bg-cyan-400/10 text-cyan-300">≤60 dtk → 720p</span>
          <span className="pill border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">Engine v4 · Anti-Burik</span>
          <span className="pill border-ember-400/30 bg-ember-400/10 text-ember-300">Dark Knight</span>
          <span className="pill">x264 tuned</span>
          <span className="pill">Kirim multi nomor</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ================= Panel QR (ring putus-putus + countdown bar) ================= */
function QrPanel({ qr, requesting, onRefresh, secondsLeft, state }) {
  const pct = (secondsLeft / QR_TTL) * 100;
  const waiting = state === 'starting' || state === 'reconnecting' || state === 'connecting' || state === 'idle';

  return (
    <div className="card p-6 text-center sm:p-8">
      <h2 className="font-display text-xl font-bold text-white">Scan QR-nya</h2>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
        Buka <b className="text-slate-200">WA</b> → titik 3 (⋯) → <b className="text-slate-200">Perangkat Tertaut</b> →{' '}
        <b className="text-slate-200">Tautkan Perangkat</b> → langsung scan QR di bawah. Gampang kok.
      </p>

      <div className="mt-7 flex justify-center">
        <div className="relative">
          {/* ring putus-putus berputar di luar QR */}
          {qr && (
            <motion.svg
              className="pointer-events-none absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)]"
              viewBox="0 0 100 100"
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            >
              <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.2" strokeDasharray="6 8" />
            </motion.svg>
          )}
          {qr ? (
            <motion.div
              key={qr.slice(0, 40)}
              initial={{ opacity: 0, scale: 0.88, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="relative rounded-2xl bg-white p-4 shadow-glow-cyan"
            >
              <span className="qr-corner -left-1.5 -top-1.5 border-l-[3px] border-t-[3px] rounded-tl-lg" />
              <span className="qr-corner -right-1.5 -top-1.5 border-r-[3px] border-t-[3px] rounded-tr-lg" />
              <span className="qr-corner -left-1.5 -bottom-1.5 border-l-[3px] border-b-[3px] rounded-bl-lg" />
              <span className="qr-corner -right-1.5 -bottom-1.5 border-r-[3px] border-b-[3px] rounded-br-lg" />
              <QRCodeCanvas value={qr} size={224} level="M" marginSize={0} fgColor="#0f172a" bgColor="#ffffff" />
              <div className="pointer-events-none absolute inset-x-3 overflow-hidden rounded-2xl" style={{ top: 12, bottom: 12 }}>
                <div className="absolute left-0 right-0 h-12 animate-scan bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent" />
              </div>
            </motion.div>
          ) : (
            <div className="grid h-[256px] w-[256px] place-items-center rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.03]">
              {waiting ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  <span className="text-xs font-medium">Nyiapin koneksi…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <QrCode className="h-8 w-8" />
                  <span className="text-xs font-medium">QR-nya belum keluar</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Countdown bar (bukan ring) */}
      <div className="mx-auto mt-6 max-w-xs">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span>QR berlaku</span>
          <span className="font-mono text-slate-300">{secondsLeft}s</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500"
            animate={{ width: `${pct}%` }}
            transition={{ ease: 'linear', duration: 1 }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center">
        <button className="btn-ghost !py-2 text-xs" onClick={onRefresh} disabled={requesting}>
          <RefreshCw className={`h-3.5 w-3.5 ${requesting ? 'animate-spin' : ''}`} /> Refresh QR
        </button>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">QR auto refresh tiap ±{QR_TTL} detik biar gak basi.</p>
    </div>
  );
}

/* ================= Panel Pairing (slot machine) ================= */
function PairingPanel({ number, setNumber, busy, code, onRequest, onCopy }) {
  return (
    <div className="card p-6 sm:p-8">
      <h2 className="font-display text-xl font-bold text-white">Pairing Code</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Buat yang HP-nya susah scan QR. Isi nomor WA (format internasional), terus klik{' '}
        <b className="text-slate-200">Ambil Kode</b>.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <label className="label">Nomor WA (contoh: 6281234567890)</label>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              placeholder="628xxxxxxxxxx"
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && !busy && onRequest()}
            />
            <button className="btn-primary shrink-0" onClick={onRequest} disabled={busy || number.length < 9}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Ambil Kode
            </button>
          </div>
        </div>

        <AnimatePresence>
          {code && (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-6 text-center"
            >
              <div className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300">Pairing Code</div>
              {/* slot machine: tiap digit berputar lalu berhenti */}
              <div className="mt-4 flex items-center justify-center gap-1.5">
                {code.split('').slice(0, 4).map((d, i) => (
                  <SlotDigit key={`a${i}`} digit={d} delay={0.1 + i * 0.1} />
                ))}
                <span className="mx-1 font-display text-2xl font-black text-cyan-400">·</span>
                {code.split('').slice(4, 8).map((d, i) => (
                  <SlotDigit key={`b${i}`} digit={d} delay={0.55 + i * 0.1} />
                ))}
              </div>
              <motion.button
                className="btn-ghost mt-4 !py-2 text-xs"
                onClick={onCopy}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                <Copy className="h-3.5 w-3.5" /> Salin
              </motion.button>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                Di HP lu: WA → titik 3 → <b className="text-slate-300">Perangkat Tertaut</b> →{' '}
                <b className="text-slate-300">Tautkan Perangkat</b> → <b className="text-slate-300">Tautkan dengan nomor telepon saja</b> →{' '}
                masukin kode tadi. Cepet ya, ±5 menit doang.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* Digit slot machine: kolom angka berputar lalu mendarat di digit target */
function SlotDigit({ digit, delay }) {
  const CELL = 52; // tinggi cell
  const SEQS = 3; // berapa kali angka 0-9 diulang di kolom
  const seq = Array.from({ length: 10 * SEQS }, (_, i) => String(i % 10));
  const landingIndex = 10 + parseInt(digit, 10); // mendarat di blok kedua (tengah)
  const extraSpin = 260 + Math.floor(Math.random() * 160); // putaran ekstra

  return (
    <div className="relative h-[52px] w-10 overflow-hidden rounded-lg border border-cyan-400/30 bg-ink-900/70 shadow-[0_0_14px_rgba(34,211,238,0.15)]">
      <motion.div
        initial={{ y: -(landingIndex * CELL + extraSpin) }}
        animate={{ y: -(landingIndex * CELL) }}
        transition={{ delay, duration: 1.3, ease: [0.15, 0.85, 0.35, 1] }}
        className="flex flex-col items-center"
      >
        {seq.map((d, i) => (
          <div key={i} className="grid h-[52px] w-full place-items-center font-mono text-2xl font-black text-white">
            {d}
          </div>
        ))}
      </motion.div>
      {/* kilau atas-bawah */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}

/* ================= Step list ================= */
function StepList({ state, phone }) {
  const steps = [
    { key: 'connect', label: 'Nyambung ke WA', icon: <Loader2 className="h-4 w-4" /> },
    { key: 'scan', label: 'Scan QR / masukin pairing code', icon: <Smartphone className="h-4 w-4" /> },
    { key: 'done', label: phone ? `Nyambung sebagai ${phone}` : 'Nyambung', icon: <Check className="h-4 w-4" /> },
  ];
  const idx = state === 'connected' ? 2 : state === 'qr' || state === 'pairing' ? 1 : 0;

  return (
    <div className="card p-5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Status Koneksi</div>
      <div className="mt-3 space-y-2.5">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="flex items-center gap-3"
            >
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] transition-colors ${
                  done ? 'border-brand/40 bg-brand/15 text-brand' : active ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-white/10 bg-white/5 text-slate-600'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
              </div>
              <span className={`text-sm ${done ? 'text-slate-300' : active ? 'font-semibold text-white' : 'text-slate-600'}`}>{s.label}</span>
              {active && state === 'reconnecting' && <span className="text-[10px] text-amber-400">(lagi nyoba ulang…)</span>}
            </motion.div>
          );
        })}
      </div>
      {state === 'logged_out' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-[11px] text-red-300"
        >
          Session udah di-logout. Scan ulang / pairing lagi buat nyambung.
        </motion.div>
      )}
    </div>
  );
}
