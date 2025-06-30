import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

export default defineConfig({
  plugins: [
    sveltekit(),
    // Bundle size visualization in development
    process.env.ANALYZE && visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap'
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      '@friggframework/ui-core': path.resolve(__dirname, '../ui-core/src'),
      '$lib': path.resolve(__dirname, 'src/lib')
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'FriggUISvelte',
      formats: ['es', 'umd']
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
        '@friggframework/ui-core'
      ],
      output: {
        globals: {
          svelte: 'Svelte',
          'svelte/store': 'SvelteStore',
          '@friggframework/ui-core': 'FriggUICore'
        },
        // Manual chunks for better code splitting
        manualChunks: {
          'components': ['./src/components/index.js'],
          'stores': ['./src/stores/index.js'],
          'actions': ['./src/actions/index.js']
        }
      }
    },
    // Production optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.warn'],
        reduce_vars: true,
        passes: 2
      },
      mangle: {
        safari10: true
      }
    },
    sourcemap: true,
    target: 'es2020',
    // Chunk size warnings
    chunkSizeWarningLimit: 500,
    // Asset handling
    assetsInlineLimit: 4096
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['svelte/store', 'svelte/motion'],
    exclude: ['@friggframework/ui-core']
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});