import { motion } from 'framer-motion';
import logoImg from '../assets/logo.png';

/** Logo KyyPureStatus (branding KyyDevv) — Dark Knight Edition.
 *  Logo asli (assets/logo.png) DIPERTAHANKAN; hanya aura/frame yang di-tema. */
export default function Logo({ size = 44, showText = true }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <motion.div
        whileHover={{ rotate: -4, scale: 1.06 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        {/* cincin glow bara + steel — PERF v4.1: CSS anim, blur di-bake ke gradient */}
        <span
          aria-hidden
          className="orb -inset-1 !rounded-2xl"
          style={{
            background:
              'radial-gradient(120% 120% at 0% 0%, rgba(255,45,85,0.55), transparent 55%), radial-gradient(120% 120% at 100% 100%, rgba(127,174,222,0.45), transparent 55%)',
            animationDuration: '3s',
          }}
        />
        <img
          src={logoImg}
          alt="KyyDevv"
          draggable={false}
          className="relative h-full w-full rounded-xl border border-white/10 object-cover shadow-card"
        />
      </motion.div>
      {showText && (
        <div className="leading-tight">
          <div className="font-display text-base font-extrabold tracking-wide text-white">
            Kyy<span className="grad-text">PureStatus</span>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Dark Knight · KyyDevv
          </div>
        </div>
      )}
    </div>
  );
}
