/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'rgb(var(--color-navy) / <alpha-value>)',
        teal: '#5FAEB6',
        'light-teal': '#7CC6CC',
        'dark-navy': '#223B73'
      },
      animation: {
        scroll: 'scroll 30s linear infinite',
        'fade-in': 'fadeIn 0.2s ease-out'
      },
      keyframes: {
        scroll: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
