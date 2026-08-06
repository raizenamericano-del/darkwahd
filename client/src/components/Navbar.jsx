import { motion } from 'framer-motion';
import { Link2, Send, Settings, Download } from 'lucide-react';
import { useApp } from '../App.jsx';
import Logo from './Logo.jsx';

const PILL_STYLES = {
  connected: 'border-brand/30 bg-brand/10 text-brand',
  reconnecting: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  logged_out: 'border-red-400/30 bg-red-400/10 text-red-300',
  qr: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  pairing: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  default: 'border-white/10 bg-white/5 text-slate-400',
};

const PILL_TEXT = {
  connected: 'Nyambung',
  reconnecting: 'Nyambung ulang…',
  logged_out: 'Ke-logout',
  qr: 'Tunggu Scan',
  pairing: 'Pairing Code',
  starting: 'Nyambung…',
  connecting: 'Nyambung…',
  disconnected: 'Keputus',
  idle: 'Belum Nyambung',
};

export default function Navbar() {
  const { conn, page, setPage, setSettingsOpen, cfg, socketReady } = useApp();
  const state = conn?.state || 'idle';
  const pill = PILL_STYLES[state] || PILL_STYLES.default;

  // PERF v4.1: backdrop-blur diganti bg opaque — blur di atas partikel animasi = lag
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink-950/95">
      <div className="mx-auto flex h-[72px] w-full max-w-4xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => setPage(conn?.state === 'connected' ? 'send' : 'connect')} className="transition-opacity hover:opacity-80">
          <Logo />
        </button>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <nav className="mr-1 flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            <TabBtn active={page === 'connect'} onClick={() => setPage('connect')} icon={<Link2 className="h-4 w-4" />} label="Koneksi" />
            <TabBtn active={page === 'send'} onClick={() => setPage('send')} icon={<Send className="h-4 w-4" />} label="Kirim" />
            <TabBtn active={page === 'download'} onClick={() => setPage('download')} icon={<Download className="h-4 w-4" />} label="Downloader" />
          </nav>

          {/* Status pill */}
          <motion.span layout className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold sm:inline-flex ${pill}`}>
            <span className="relative flex h-2 w-2">
              {state === 'connected' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${state === 'connected' ? 'bg-brand' : state === 'reconnecting' || state === 'connecting' || state === 'starting' ? 'animate-pulse bg-amber-400' : 'bg-slate-500'}`} />
            </span>
            {PILL_TEXT[state] || state}
            {cfg?.mockSend && <span className="rounded bg-amber-400/20 px-1 py-0.5 text-[9px] font-bold text-amber-300">UJI</span>}
          </motion.span>

          <button onClick={() => setSettingsOpen(true)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!socketReady && (
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-brand to-transparent bg-[length:200%_100%]" />
        </div>
      )}
    </header>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? 'text-ink-950' : 'text-slate-400 hover:text-white'}`}
    >
      {active && (
        <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand to-cyan-400 shadow-glow" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
    </button>
  );
}
