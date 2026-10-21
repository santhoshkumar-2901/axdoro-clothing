/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        axdoro: {
          bg: 'var(--axdoro-bg)',
          surface: 'var(--axdoro-surface)',
          'surface-muted': 'var(--axdoro-surface-muted)',
          text: 'var(--axdoro-text)',
          'text-muted': 'var(--axdoro-text-muted)',
          charcoal: 'var(--axdoro-charcoal)',
          ivory: 'var(--axdoro-ivory)',
          accent: 'var(--axdoro-accent)',
          'accent-muted': 'var(--axdoro-accent-muted)',
          'accent-subtle': 'var(--axdoro-accent-subtle)',
          border: 'var(--axdoro-border)',
          'border-strong': 'var(--axdoro-border-strong)',
          ring: 'var(--axdoro-ring)',
          purple: 'var(--axdoro-purple)',
        },
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 1px 3px 0 rgba(0, 0, 0, 0.02)',
        card: '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',
        elevated: '0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};
