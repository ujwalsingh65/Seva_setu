/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#0B8F68',
          'green-dark': '#087A5A',
          teal: '#06343B',
          mint: '#DDF5EA',
          'light-green': '#EAF8F2',
          'soft-blue': '#EAF4FB',
          'soft-orange': '#FFF1D8',
          'soft-red': '#FDECEC',
          background: '#F8FAF9',
          surface: '#FFFFFF',
          border: '#DDE4E1',
          text: '#122326',
          'text-secondary': '#526467',
          'text-muted': '#7C8B8D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        h1: ['clamp(2rem, 1.2rem + 2.4vw, 3rem)', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
        h2: ['clamp(1.5rem, 1.1rem + 1.2vw, 2rem)', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }],
        h3: ['clamp(1.125rem, 1rem + 0.4vw, 1.375rem)', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['clamp(0.875rem, 0.85rem + 0.15vw, 1rem)', { lineHeight: '1.6', fontWeight: '400' }],
        small: ['clamp(0.75rem, 0.72rem + 0.15vw, 0.875rem)', { lineHeight: '1.5', fontWeight: '400' }],
      },
      maxWidth: {
        content: '1280px',
      },
      boxShadow: {
        card: '0 2px 10px rgba(6, 52, 59, 0.06)',
        'card-hover': '0 6px 20px rgba(6, 52, 59, 0.10)',
        dropdown: '0 8px 24px rgba(6, 52, 59, 0.12)',
      },
      borderRadius: {
        small: '8px',
        medium: '12px',
        large: '16px',
        xl: '24px',
        pill: '9999px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 240ms ease-out',
        'scale-in': 'scale-in 160ms ease-out',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};
