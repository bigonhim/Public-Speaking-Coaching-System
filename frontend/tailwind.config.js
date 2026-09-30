/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Distinctive geometric display face — used for headlines, the wordmark
        // and big numerics so the app has a voice of its own.
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Ink — a warm near-black navy for text, softer than pure slate.
        ink: {
          50: '#f6f7fb', 100: '#eceef6', 200: '#d6dae9', 300: '#b2b9d1',
          400: '#8790b2', 500: '#646d93', 600: '#4b5377', 700: '#3a4160',
          800: '#232842', 900: '#141830', 950: '#0b0e20',
        },
        // Brand — electric violet. Confident, modern, distinct from the stock
        // indigo look.
        brand: {
          50: '#f2f0ff', 100: '#e7e2ff', 200: '#d0c6ff', 300: '#b3a1ff',
          400: '#9578ff', 500: '#7a50ff', 600: '#6a34f5', 700: '#5a23d8',
          800: '#4a1eae', 900: '#3d1c88', 950: '#250f56',
        },
        // Accent — warm coral. Energy, highlights, the "every time" moment.
        accent: {
          50: '#fff2ee', 100: '#ffe1d8', 200: '#ffc3b1', 300: '#ff9c80',
          400: '#ff7452', 500: '#ff5630', 600: '#ed3813', 700: '#c62a0f',
          800: '#9c2513', 900: '#7e2416',
        },
        // Semantic component colours — shared by score bars AND charts so the
        // whole app reads as one system. Tuned to stay distinct from brand.
        pace: '#06b6d4',      // cyan
        filler: '#f59e0b',    // amber
        pause: '#ec4899',     // pink
        relevance: '#10b981', // emerald
        overall: '#7a50ff',   // brand-500
      },
      boxShadow: {
        // Soft ambient depth for cards.
        soft: '0 1px 2px rgba(20, 24, 48, 0.04), 0 12px 32px -12px rgba(37, 15, 86, 0.16)',
        lift: '0 2px 4px rgba(20, 24, 48, 0.05), 0 24px 48px -16px rgba(37, 15, 86, 0.28)',
        // Coloured glow for primary CTAs.
        glow: '0 10px 30px -8px rgba(122, 80, 255, 0.55)',
        'glow-accent': '0 10px 30px -8px rgba(255, 86, 48, 0.5)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(122,80,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(122,80,255,0.05) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.7)' },
          '50%': { transform: 'scale(1.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-9px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        // Audience life — a gentle idle sway so the crowd is never frozen, and a
        // livelier bob for faces that are actively nodding along.
        'audience-sway': {
          '0%, 100%': { transform: 'translateY(0) rotate(-0.6deg)' },
          '50%': { transform: 'translateY(-2px) rotate(0.6deg)' },
        },
        'audience-nod': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '35%': { transform: 'translateY(2.5px) rotate(1deg)' },
          '70%': { transform: 'translateY(0) rotate(0deg)' },
        },
        // Equalizer bars (Waveform). Scale only — never height — so a wall of
        // 88 bars animates on the compositor instead of relaying out.
        wave: {
          '0%, 100%': { transform: 'scaleY(0.32)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.45s ease-out both',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float-slow 8s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'gradient-pan': 'gradient-pan 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'audience-sway': 'audience-sway 5.5s ease-in-out infinite',
        'audience-nod': 'audience-nod 1.7s ease-in-out infinite',
        breathe: 'breathe 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        wave: 'wave 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
