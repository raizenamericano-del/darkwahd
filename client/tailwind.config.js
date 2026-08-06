/** @type {import('tailwindcss').Config} */
/* ============================================================
 * DARK KNIGHT EDITION — palet obsidian + ember crimson + molten
 * gold + steel blue. Skala bawaan tailwind (fuchsia/violet/cyan/
 * emerald/…) di-remap biar SELURUH komponen lama ikut tema tanpa
 * harus rewrite satu-satu.
 * ============================================================ */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#ff2d55', dark: '#d40f3e' },
        ember: { 300: '#ffd9a0', 400: '#ffb454', 500: '#f59a23', 600: '#d97b0f' },
        steel: { 300: '#a9c9e8', 400: '#7faede', 500: '#5b8fc7' },
        // — remap palet lama ke keluarga Dark Knight —
        fuchsia: { 200: '#ffc9d4', 300: '#ff9db1', 400: '#ff5c7a', 500: '#f42a52', 600: '#d40f3e', 900: '#55101f', 950: '#2b0710' },
        violet: { 200: '#ffc2cd', 300: '#ff8fa5', 400: '#ff4d6e', 500: '#e0164a', 600: '#b01038', 900: '#400d1c', 950: '#22060e' },
        purple: { 200: '#ffc9d4', 300: '#ff9db1' },
        cyan: { 300: '#a9c9e8', 400: '#7faede', 500: '#5b8fc7' },
        emerald: { 300: '#ffd9a0', 400: '#ffb454', 500: '#f59a23' },
        indigo: { 500: '#3c5a86' },
        ink: {
          950: '#060609',
          900: '#0b0b11',
          850: '#0f0f16',
          800: '#14141d',
          700: '#1d1d29',
        },
        line: 'rgba(255,255,255,0.1)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Cinzel Variable"', '"Space Grotesk Variable"', 'Inter', 'ui-serif', 'serif'],
      },
      boxShadow: {
        card: '0 10px 40px -12px rgba(0,0,0,0.7)',
        glow: '0 0 45px -10px rgba(255,45,85,0.55)',
        'glow-fuchsia': '0 0 45px -10px rgba(255,92,122,0.5)',
        'glow-cyan': '0 0 45px -10px rgba(127,174,222,0.45)',
        'glow-ember': '0 0 40px -10px rgba(255,180,84,0.5)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.15)', opacity: '0' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        gradientX: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(300%)' },
        },
        flicker: {
          '0%,100%': { opacity: '1' },
          '8%': { opacity: '0.6' },
          '10%': { opacity: '0.9' },
          '22%': { opacity: '0.5' },
          '24%': { opacity: '1' },
          '55%': { opacity: '0.75' },
          '57%': { opacity: '1' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        gradientX: 'gradientX 8s ease infinite',
        scan: 'scan 2.4s ease-in-out infinite',
        flicker: 'flicker 4s linear infinite',
      },
    },
  },
  plugins: [],
};
