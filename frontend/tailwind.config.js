/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // One family in two cuts. Geist carries the interface and the
        // headlines; Geist Mono is the "printed on the hardware" voice — module
        // labels, keys and every readout.
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // The desk the console sits on, and the console's own surfaces.
        canvas: '#D9D6CF',
        chassis: {
          DEFAULT: '#ECEAE5',
          top: '#F3F1EC',
          bottom: '#E6E3DC',
          plate: '#E6E3DD',
          well: '#E3E0D9',
        },
        // Ink — warm graphite. Named "ink" so every page written against the
        // old palette still resolves.
        ink: {
          50: '#F7F6F3', 100: '#EEECE7', 200: '#DDD9D1', 300: '#C3BEB3',
          400: '#9A958B', 500: '#5F5C55', 600: '#4A4741', 700: '#36342F',
          800: '#262522', 900: '#1D1C1A', 950: '#121110',
        },
        // Brand — signal orange, the colour of a lit record button. The only
        // brand colour. 500 is for fills (with ink text on top); 600 and up
        // are dark enough for text on the light chassis.
        brand: {
          50: '#FFF3EC', 100: '#FFE3D3', 200: '#FFC3A3', 300: '#FF9C6B',
          400: '#FF7A3D', 500: '#F2541B', 600: '#C2410C', 700: '#9A3412',
          800: '#7C2D12', 900: '#5E2208', 950: '#3E1203',
        },
        // Accent — red, reserved for deleting and for errors. Recording is
        // orange now, so this no longer competes with the brand.
        accent: {
          50: '#FEF3F2', 100: '#FEE4E2', 200: '#FECDCA', 300: '#FDA29B',
          400: '#F97066', 500: '#F04438', 600: '#D92D20', 700: '#B42318',
          800: '#912018', 900: '#7A271A',
        },
        // The dark display windows set into the console.
        lcd: {
          DEFAULT: '#131512',
          panel: '#1A1C19',
          off: '#2A2C28',
          text: '#F1EDE2',
          soft: '#A9A497',
          dim: '#8D8A80',
          glow: '#FF6A2B',
        },
        // Semantic component colours — the Progress charts still tell the four
        // parts apart by hue.
        pace: '#06b6d4',
        filler: '#f59e0b',
        pause: '#ec4899',
        relevance: '#10b981',
        overall: '#F2541B',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(60, 45, 20, 0.08)',
        lift: '0 0 0 1px rgba(0, 0, 0, 0.07), 0 18px 34px -18px rgba(60, 45, 20, 0.4)',
        // Kept as names because the not-yet-redesigned screens reference them.
        glow: '0 1px 2px rgba(60, 45, 20, 0.2)',
        'glow-accent': '0 1px 2px rgba(122, 39, 26, 0.2)',
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
        // A hard on/off LED blink, the way hardware does it.
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0.25' },
        },
        // The record button breathing out a ring of light while it is live.
        'rec-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(255, 90, 31, 0.55)' },
          '100%': { boxShadow: '0 0 0 14px rgba(255, 90, 31, 0)' },
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
        blink: 'blink 1.2s linear infinite',
        'rec-ring': 'rec-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
}
