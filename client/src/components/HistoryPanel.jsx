import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock, History, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import { fmtBytes, fmtDate, fmtDuration } from '../lib/store.js';

/** Riwayat pengiriman — item sukses bisa dikirim ulang */
export default function HistoryPanel({ onResend, busy }) {
  const { history, addToast, socket } = useApp();
  const [resendingId, setResendingId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!history.length) return null;

  const handleResend = async (entry) => {
    if (busy) {
      addToast('warn', 'Lagi sibuk', 'Masih ada proses jalan. Tunggu selesai dulu ya.');
      return;
    }
    setResendingId(entry.id);
    // Beri jeda kecil supaya state resending terlihat
    setTimeout(() => {
      setResendingId(null);
      onResend(entry);
    }, 600);
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/history/${id}`, { method: 'DELETE' });
      addToast('info', 'Dihapus', 'Riwayat udah dihapus.');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    try {
      await api('/api/history', { method: 'DELETE' });
      addToast('info', 'Riwayat udah dibersihin', '');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-extrabold text-white">Riwayat Kiriman</h3>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">{history.length}</span>
        </div>
        <button onClick={handleClearAll} className="text-[11px] font-medium text-slate-500 transition hover:text-red-400">
          {confirmClear ? 'Yakin? Klik lagi' : 'Bersihin Semua'}
        </button>
      </div>

      <div className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {history.map((h) => (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -30 }}
              whileHover={{ scale: 1.012, borderColor: 'rgba(255,45,85,0.35)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3 transition-colors"
            >
              {/* Thumbnail */}
              {h.thumbFile ? (
                <img
                  src={`/api/thumb/${h.id}`}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-600">
                  <Clock className="h-5 w-5" />
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-white">{h.originalName}</span>
                  {h.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  {h.source === 'resend' && (
                    <span className="shrink-0 rounded bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">ULANG</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                  <span className="font-mono text-cyan-300/90">→ {h.target || '—'}{h.targets?.length > 1 ? ` +${h.targets.length - 1}` : ''}</span>
                  {h.status === 'success' && (
                    <>
                      <span>·</span>
                      <span>{h.resolution}</span>
                      <span>·</span>
                      <span>{fmtDuration(h.durationSec)}</span>
                      <span>·</span>
                      <span>{h.sizeMB} MB</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{fmtDate(h.createdAt)}</span>
                </div>
                {h.status === 'failed' && h.error && <div className="mt-0.5 truncate text-[10px] text-red-400/80">{h.error}</div>}
              </div>

              {/* Aksi */}
              <div className="flex shrink-0 items-center gap-1">
                {h.status === 'success' && (
                  <button
                    onClick={() => handleResend(h)}
                    disabled={busy || resendingId === h.id}
                    className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                    title="Kirim ulang video ini"
                  >
                    {resendingId === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Kirim Ulang</span>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(h.id)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-red-400/10 hover:text-red-400"
                  title="Hapus riwayat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
