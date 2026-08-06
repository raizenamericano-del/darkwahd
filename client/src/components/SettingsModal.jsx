import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Phone, Settings as SettingsIcon, Trash2, Unplug, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import Logo from './Logo.jsx';

/** Modal Settings — tujuan default, session, riwayat, info */
export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, conn, cfg, addToast } = useApp();
  const [target, setTarget] = useState(store.getTarget());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      setTarget(store.getTarget());
      setSaved(false);
    }
  }, [settingsOpen]);

  // Tutup dengan tombol Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => e.key === 'Escape' && setSettingsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  const saveTarget = () => {
    store.setTarget(target.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const doDisconnect = async () => {
    try {
      await api('/api/disconnect', { method: 'POST' });
      addToast('info', 'Terputus', 'Udah diputus, session aman kok.');
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

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
        onClick={() => setSettingsOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="card max-h-[85vh] w-full max-w-md overflow-y-auto p-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-extrabold text-white">Settings</h2>
            </div>
            <button onClick={() => setSettingsOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Session info */}
          <div className="mt-5 rounded-xl border border-line bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Session WA</div>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
                <Phone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-white">{conn?.phone || '—'}</div>
                <div className="text-[11px] text-slate-500">
                  {conn?.state === 'connected' ? 'Nyambung · session ke-save' : `Status: ${conn?.state}`}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1 !py-2 text-xs" onClick={doDisconnect} disabled={conn?.state !== 'connected'}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </button>
              <button className="btn-danger flex-1 !py-2 text-xs" onClick={doLogout} disabled={conn?.state !== 'connected'}>
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            </div>
          </div>

          {/* Default target */}
          <div className="mt-4 rounded-xl border border-line bg-white/[0.03] p-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nomor Tujuan Default</label>
            <div className="mt-2 flex gap-2">
              <input
                className="input font-mono"
                placeholder="628xxxxxxxxxx"
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))}
              />
              <button className="btn-primary shrink-0 !px-4" onClick={saveTarget}>
                {saved ? '✓' : 'Simpan'}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Bakal auto keisi di halaman kirim video.</p>
          </div>

          {/* Danger */}
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-red-300">Zona Bahaya</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">Hapus riwayat kiriman</div>
              <button className="btn-danger !py-1.5 text-[11px]" onClick={async () => {
                try {
                  await api('/api/history', { method: 'DELETE' });
                  addToast('info', 'Riwayat dikosongkan', '');
                } catch (err) {
                  addToast('error', 'Gagal', err.message);
                }
              }}>
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </button>
            </div>
          </div>

          {/* About */}
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <Logo size={36} />
            <div className="text-right text-[10px] leading-relaxed text-slate-500">
              v{cfg?.version || '1.0.0'}
              <br />
              {cfg?.mockSend && <span className="font-bold text-amber-400">MODE UJI AKTIF (MOCK_SEND)</span>}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
