/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand — calm, confident indigo/violet.
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
        // Semantic component colours — shared by score bars AND charts so the
        // whole app reads as one system.
        pace: '#0ea5e9',      // sky
        filler: '#f59e0b',    // amber
        pause: '#8b5cf6',     // violet
        relevance: '#10b981', // emerald
        overall: '#4f46e5',   // indigo (brand-600)
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgba(49, 46, 129, 0.18)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.7)' },
          '50%': { transform: 'scale(1.15)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}
