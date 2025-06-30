/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
    "./node_modules/@friggframework/ui-angular/**/*.{js,ts}"
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