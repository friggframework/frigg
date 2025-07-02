import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Generate custom elements mode for maximum compatibility
        customElement: false
      }
    }),
    // Bundle size visualization in development
    process.env.ANALYZE && visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap'
    })
  ].filter(Boolean),
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'FriggUISvelte',
      fileName: (format) => `index.${format}.js`
    },
    rollupOptions: {
      external: [
        'svelte',
        'svelte/store',
        'svelte/motion',
        'svelte/transition',
        'svelte/animate',
        'svelte/easing',
        'svelte/internal',
        'svelte/compiler',
        '@friggframework/ui-core'
      ],
      output: {
        // Provide global variables to use in the UMD build
        globals: {
          svelte: 'Svelte',
          'svelte/store': 'SvelteStore',
          '@friggframework/ui-core': 'FriggUICore'
        }
      }
    },
    // Production optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    sourcemap: true
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, 'src/lib')
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.svelte']
  }
});