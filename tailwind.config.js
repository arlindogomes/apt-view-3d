/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#0f1117',
          panel: '#161922',
          surface: '#1d212d',
          border: '#2a3040',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          text: '#e5e7eb',
          muted: '#9ca3af',
        },
      },
    },
  },
  plugins: [],
};
