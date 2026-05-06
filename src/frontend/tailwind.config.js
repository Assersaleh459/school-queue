/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#19224A',
        teal: '#5FAEB6',
        'light-teal': '#7CC6CC',
        'dark-navy': '#223B73'
      },
      animation: {
        scroll: 'scroll 30s linear infinite'
      },
      keyframes: {
        scroll: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' }
        }
      }
    }
  },
  plugins: []
}
