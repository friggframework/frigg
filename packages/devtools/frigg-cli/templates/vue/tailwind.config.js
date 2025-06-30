/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
    "./node_modules/@friggframework/ui-vue/**/*.{vue,js}"
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