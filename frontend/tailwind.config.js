/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neo: {
          bg: '#F8F7F3',
          yellow: '#FFE600',
          pink: '#FF70A6',
          purple: '#A78BFA',
          green: '#4ADE80',
          blue: '#38BDF8',
          orange: '#FB923C',
          cream: '#FFFDF8',
        }
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #000000',
        'neo-lg': '6px 6px 0px 0px #000000',
        'neo-xl': '8px 8px 0px 0px #000000',
        'neo-sm': '2px 2px 0px 0px #000000',
      }
    },
  },
  plugins: [],
}
