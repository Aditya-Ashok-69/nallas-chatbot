/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Nallas Brand Colors
        nallas: {
          red: '#E55455',
          dark: '#181817',
          cyan: '#7BCBD9',
          yellow: '#F5C546',
          white: '#FFFFFF',
        },
        // Text Colors
        heading: {
          dark: '#1B242B',
          light: '#FAFAFA',
        },
        para: {
          dark: '#676D71',
          light: '#FAFAFACC',
        },
        // UI surfaces
        surface: {
          light: '#FFFFFF',
          'light-2': '#F8F9FA',
          dark: '#181817',
          'dark-2': '#1F1F1E',
          'dark-3': '#2A2A29',
        },
        border: {
          light: '#E5E7EB',
          dark: '#2A2A29',
        }
      },
      fontFamily: {
        sans: ['Epilogue', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        heading: '500',
        body: '400',
      },
      animation: {
        'spin-slow': 'spin 1.5s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-dot': 'pulseDot 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
