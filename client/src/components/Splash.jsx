import { motion } from 'framer-motion';
import logoImg from '../assets/logo.png';

/** Splash screen v4 "DARK KNIGHT" — logo pop + bara api + judul glitch */
const SPLASH_EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: Math.random() * 100,
  size: 2 + Math.random() * 3.5,
  delay: Math.random() * 2.2,
  dur: 2.6 + Math.random() * 2.4,
  drift: (Math.random() * 30 - 15).toFixed(0) + 'px',
}));

export default function Splash() {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-ink-950"
      exit={{ opacity: 0, scale: 1.06 }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
    >
      {/* grid latar ksatria */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, black, transparent 75%)',
        }}
      />
      {/* searchlight + bara */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="searchlight" />
        {SPLASH_EMBERS.map((p, i) => (
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
        {/* PERF v4.1: gradient orb, denyut via CSS (compositor) */}
        <div
          className="orb left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(closest-side, rgba(255,45,85,0.22), transparent 70%)', animationDuration: '2.6s' }}
        />
      </div>

      <div className="relative flex w-72 flex-col items-center gap-6">
        {/* logo pop dari blur — logo asli dipertahankan */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, filter: 'blur(14px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 200, damping: 16 }}
          className="knight-frame knight-frame-spin relative overflow-hidden p-[3px] shadow-glow"
          style={{ width: 94, height: 94 }}
        >
          <img src={logoImg} alt="KyyDevv" draggable={false} className="h-full w-full rounded-[1.1rem] object-cover" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <div className="font-display text-2xl font-bold tracking-wide text-white">
            Kyy<span className="grad-text dk-title" data-text="PureStatus">PureStatus</span>
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
            by KyyDevv
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.25em] text-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember-400" />
            Dark Knight Edition
          </div>
        </motion.div>

        {/* progress bar bara api */}
        <div className="w-full">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand via-ember-400 to-steel-400"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 1.1, ease: 'easeInOut' }}
            />
          </div>
          <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-600">
            Engine v4 · Status HD Anti-Burik
          </div>
        </div>
      </div>
    </motion.div>
  );
}
