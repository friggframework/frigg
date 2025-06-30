/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@friggframework/ui/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--frigg-primary)',
        'primary-hover': 'var(--frigg-primary-hover)',
        background: 'var(--frigg-background)',
        foreground: 'var(--frigg-foreground)',
        muted: 'var(--frigg-muted)',
        'muted-foreground': 'var(--frigg-muted-foreground)',
        border: 'var(--frigg-border)',
        ring: 'var(--frigg-ring)',
      },
    },
  },
  plugins: [],
}