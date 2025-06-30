import { defineConfig } from 'vite';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
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
      entry: resolve(__dirname, 'src/index.js'),
      name: 'FriggUICore',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format}.js`
    },
    rollupOptions: {
      external: ['node-fetch'],
      output: [
        {
          format: 'es',
          entryFileNames: '[name].es.js',
          chunkFileNames: '[name]-[hash].es.js',
          dir: 'dist',
          // Preserve module structure for better tree shaking
          preserveModules: true,
          preserveModulesRoot: 'src',
          // Manual chunks for better code splitting
          manualChunks: {
            'api': ['src/api/index.js'],
            'state': ['src/state/index.js'],
            'utils': ['src/utils/index.js'],
            'models': ['src/models/index.js'],
            'services': ['src/services/index.js'],
            'plugins': ['src/plugins/index.js']
          }
        },
        {
          format: 'umd',
          name: 'FriggUICore',
          file: 'dist/index.umd.js',
          globals: {
            'node-fetch': 'fetch'
          }
        }
      ]
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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.js']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});