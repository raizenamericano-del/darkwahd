import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-brand" />,
  error: <XCircle className="h-5 w-5 text-red-400" />,
  warn: <AlertTriangle className="h-5 w-5 text-amber-400" />,
  info: <Info className="h-5 w-5 text-cyan-400" />,
};

/** Toast notification (kanan atas) */
export default function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-white/10 bg-ink-800 p-3.5 shadow-card"
          >
            <div className="mt-0.5 shrink-0">{ICONS[t.type] || ICONS.info}</div>
            <div className="min-w-0">
              {t.title && <div className="text-sm font-semibold text-white">{t.title}</div>}
              {t.message && <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.message}</div>}
            </div>
            {/* timer bar — menyusut selama 6 detik */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 rounded-full bg-gradient-to-r from-brand to-fuchsia-500"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
