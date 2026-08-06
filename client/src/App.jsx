import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';
import { api } from './lib/api';
import { store } from './lib/store';
import Splash from './components/Splash.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ConnectPage from './components/ConnectPage.jsx';
import SendPage from './components/SendPage.jsx';
import DownloadPage from './components/DownloadPage.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Toasts from './components/Toasts.jsx';
import KeyGate from './components/KeyGate.jsx';

// Konteks global: toast + socket + conn + history + cfg
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// PERF v4.1: deteksi perangkat — biar animasi tetap keren tapi gak ngelag.
//  - REDUCED : user minta reduced-motion → CSS matikan semua animasi.
//  - LOW_POWER: CPU ≤4 thread → partikel dikit, layer mahal (smoke/searchlight) off.
//  - MOBILE  : layar sentuh → partikel sedang.
const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const LOW_POWER = REDUCED || (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4);
const MOBILE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

// Partikel bara api (ember) untuk background — generated sekali, tetap.
// Bara naik dari bawah layar sambil berkedip & melayang (khas Dark Knight).
const EMBERS = Array.from({ length: LOW_POWER ? 12 : MOBILE ? 22 : 36 }, (_, i) => ({
  left: Math.random() * 100,
  size: 2 + Math.random() * 4,
  delay: Math.random() * 14,
  dur: 7 + Math.random() * 9,
  drift: (Math.random() * 44 - 22).toFixed(0) + 'px',
}));

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [conn, setConn] = useState(null);
  const [history, setHistory] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [splash, setSplash] = useState(true);
  const [page, setPage] = useState(store.getPage() || 'connect');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gateError, setGateError] = useState(null);
  const socketRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);

  // ---------- Toast ----------
  const addToast = useCallback((type, title, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // ---------- Config + gate ----------
  useEffect(() => {
    api('/api/config')
      .then((c) => {
        setCfg(c);
        window.CONFIG = c; // dipakai komponen lain (batas ukuran, dll)
      })
      .catch(() => {
        if (store.getKey()) {
          store.setKey('');
          setGateError('App key-nya salah nih, coba lagi.');
          window.location.reload();
        } else {
          setGateError('Gagal nyambung ke server. Coba refresh.');
        }
      });
  }, []);

  const keyRequired = cfg?.appKeyRequired && !store.getKey();

  // ---------- Socket ----------
  useEffect(() => {
    if (!cfg || keyRequired) return;
    const sock = io('/', {
      transports: ['websocket', 'polling'],
      auth: { key: store.getKey() },
      reconnectionDelayMax: 5000,
    });
    socketRef.current = sock;

    sock.on('connect', () => setSocketReady(true));
    sock.on('disconnect', () => setSocketReady(false));
    sock.on('connect_error', (err) => {
      if (err.message === 'unauthorized') {
        store.setKey('');
        setGateError('App key-nya salah nih, coba lagi.');
        window.location.reload();
      }
    });

    sock.on('conn:update', (st) => setConn(st));
    sock.on('history:update', (h) => setHistory(h || []));
    sock.on('notice', (n) => addToast(n.type || 'info', n.title || '', n.message || ''));
    sock.on('send:error', (e) => {
      if (e?.code !== 'CANCELED') addToast('error', 'Gagal', e?.message || 'Ada yang error, coba lagi ya.');
    });

    // Sinkron status awal
    api('/api/status').then(setConn).catch(() => {});
    return () => {
      sock.removeAllListeners();
      sock.close();
      socketRef.current = null;
      setSocketReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, keyRequired]);

  // Auto-pindah ke halaman Kirim SEKALI saat transisi ke connected
  // (tidak memaksa user kembali saat mereka membuka tab Koneksi secara manual)
  const prevConnState = useRef(null); // null = pertama kali load
  useEffect(() => {
    const prev = prevConnState.current;
    prevConnState.current = conn?.state;
    // Auto-pindah saat: (a) load awal sudah connected, atau (b) baru saja transisi ke connected.
    // Setelah itu user bebas membuka tab Koneksi tanpa dipaksa balik.
    if (conn?.state === 'connected' && prev !== 'connected' && page === 'connect') {
      setPage('send');
    }
  }, [conn?.state, page]);

  // Splash
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Dalam mode uji (MOCK_SEND), halaman Kirim dianggap bisa dipakai tanpa
  // koneksi asli — status koneksi tetap ditampilkan apa adanya di halaman Koneksi.
  const effectiveConnected = !!cfg?.mockSend || conn?.state === 'connected';

  const ctx = {
    cfg,
    conn,
    effectiveConnected,
    history,
    setHistory,
    socket: socketRef.current,
    socketReady,
    addToast,
    page,
    setPage,
    settingsOpen,
    setSettingsOpen,
    gateError,
    setGateError,
  };

  return (
    <Ctx.Provider value={ctx}>
      <AnimatePresence>{splash && <Splash key="splash" />}</AnimatePresence>

      <div className="relative flex min-h-screen flex-col">
        {/* DARK KNIGHT background: searchlight + kabut + glow + bara api
            PERF v4.1: glow = radial-gradient (tanpa filter blur, tanpa framer-motion
            → nol repaint besar); smoke/searchlight dimatikan di perangkat lemah. */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          {!LOW_POWER && (
            <>
              {/* searchlight berputar ala Bat-Signal (compositor-only) */}
              <div className="searchlight" />
              {/* kabut Gotham */}
              <div className="smoke left-[-15%] top-[12%] h-[24rem] w-[36rem]" style={{ animationDuration: '26s' }} />
              <div className="smoke right-[-18%] top-[48%] h-[22rem] w-[34rem]" style={{ animationDuration: '32s', animationDelay: '-9s' }} />
              <div className="smoke left-[22%] bottom-[-14%] h-[20rem] w-[40rem]" style={{ animationDuration: '29s', animationDelay: '-17s' }} />
            </>
          )}
          {/* glow orb — gradient murni, denyut via CSS */}
          <div
            className="orb -top-40 left-1/2 h-[30rem] w-[34rem] -translate-x-1/2"
            style={{ background: 'radial-gradient(closest-side, rgba(255,45,85,0.16), transparent 70%)', animationDuration: '14s' }}
          />
          <div
            className="orb bottom-[-20%] right-[-8%] h-[26rem] w-[26rem]"
            style={{ background: 'radial-gradient(closest-side, rgba(245,154,35,0.12), transparent 70%)', animationDuration: '18s', animationDelay: '2s' }}
          />
          <div
            className="orb left-[-10%] top-[35%] h-80 w-80"
            style={{ background: 'radial-gradient(closest-side, rgba(91,143,199,0.12), transparent 70%)', animationDuration: '16s', animationDelay: '4s' }}
          />
          {/* bara api naik */}
          {EMBERS.map((p, i) => (
            <span
              key={i}
              className="ember"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
                '--drift': p.drift,
              }}
            />
          ))}
        </div>

        {keyRequired ? (
          <KeyGate />
        ) : (
          <>
            <Navbar />
            <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-8 sm:px-6">
              {/* Catatan: sengaja TANPA AnimatePresence mode="wait" — ada bug di
                  framer-motion tertentu yang membuat halaman lama tidak pernah exit
                  sehingga halaman baru tidak ter-mount. motion.div + key sudah cukup. */}
              {page === 'connect' ? (
                <motion.div key="connect" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <ConnectPage />
                </motion.div>
              ) : page === 'download' ? (
                <motion.div key="download" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <DownloadPage />
                </motion.div>
              ) : (
                <motion.div key="send" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <SendPage />
                </motion.div>
              )}
            </main>
            <Footer />
          </>
        )}

        <SettingsModal />
        <Toasts toasts={toasts} />
      </div>
    </Ctx.Provider>
  );
}
