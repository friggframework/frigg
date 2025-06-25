/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'frigg-blue': '#0066CC',
        'frigg-dark': '#1A1A1A',
        'frigg-gray': '#F5F5F5',
      }
    },
  },
  plugins: [],
}