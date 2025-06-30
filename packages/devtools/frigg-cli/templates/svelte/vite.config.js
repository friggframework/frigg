import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

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
	server: {
		port: 3000,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
				secure: false
			}
		}
	},
	build: {
		// Production optimizations
		minify: 'terser',
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true,
				pure_funcs: ['console.log', 'console.warn']
			}
		},
		// Code splitting
		rollupOptions: {
			output: {
				manualChunks: {
					vendor: ['svelte', '@sveltejs/kit'],
					frigg: ['@friggframework/ui-core', '@friggframework/ui-svelte'],
					utils: ['axios', 'lodash']  // Common utility libs
				}
			}
		},
		// Chunk size warnings
		chunkSizeWarningLimit: 1000,
		// Asset handling
		assetsInlineLimit: 4096,
		target: 'es2020',
		sourcemap: true
	},
	// Optimize dependencies
	optimizeDeps: {
		include: ['svelte', '@sveltejs/kit'],
		exclude: ['@friggframework/ui-core', '@friggframework/ui-svelte']
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom'
	}
});