import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    vue(),
    // Bundle size visualization in development
    process.env.ANALYZE && visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    })
  ].filter(Boolean),
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'FriggUIVue',
      fileName: (format) => `index.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      // Externalize peer dependencies
      external: [
        'vue', 
        '@friggframework/ui-core',
        '@friggframework/ui-core/plugins',
        '@friggframework/ui-core/api',
        '@friggframework/ui-core/state',
        '@friggframework/ui-core/services',
        '@friggframework/ui-core/utils',
        '@friggframework/ui-core/models'
      ],
      output: [
        {
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].es.js'
        },
        {
          format: 'umd',
          name: 'FriggUIVue',
          entryFileNames: 'index.umd.js',
          globals: {
            vue: 'Vue',
            '@friggframework/ui-core': 'FriggUICore'
          }
        }
      ]
    },
    // Production optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // Source maps for debugging
    sourcemap: true,
    // Chunk size warnings
    chunkSizeWarningLimit: 500,
    // CSS code splitting
    cssCodeSplit: true,
    // Asset handling
    assetsInlineLimit: 4096,
    // Target modern browsers
    target: 'es2015'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  // Development server optimizations
  server: {
    fs: {
      strict: false
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['vue'],
    exclude: ['@friggframework/ui-core']
  }
});