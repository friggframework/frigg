# Frigg Performance Guide

## Overview

The Frigg framework is optimized for production-grade performance with minimal bundle sizes, fast build times, and efficient runtime performance. This guide covers performance optimization strategies, monitoring tools, and best practices.

## 🎯 Performance Targets

### Bundle Size Targets
- **ui-core**: ≤ 100KB (excellent), ≤ 250KB (good)
- **Framework packages**: ≤ 50KB additional overhead
- **Template applications**: ≤ 1MB total bundle size

### Build Time Targets
- **Framework packages**: ≤ 15 seconds
- **Template applications**: ≤ 60 seconds
- **CI/CD builds**: ≤ 5 minutes total

### Runtime Performance Targets
- **First Contentful Paint (FCP)**: ≤ 2 seconds
- **Largest Contentful Paint (LCP)**: ≤ 2.5 seconds
- **First Input Delay (FID)**: ≤ 100ms
- **Cumulative Layout Shift (CLS)**: ≤ 0.1

## 📦 Bundle Size Optimization

### Framework Packages

All framework packages include optimized build configurations:

```javascript
// Optimized Vite config features:
- Tree shaking enabled
- Code splitting with manual chunks
- Terser minification with multiple passes
- Dead code elimination
- Dependency externalization
```

### Bundle Analysis

Analyze bundle sizes using the built-in tools:

```bash
# Framework packages
cd packages/ui-core && npm run build:analyze
cd packages/ui-vue && npm run build:analyze
cd packages/ui-svelte && npm run build:analyze

# Angular package
cd packages/ui-angular && npm run build:analyze

# Template applications
cd your-app && ANALYZE=true npm run build
```

### Bundle Size Best Practices

1. **Import only what you need**:
   ```javascript
   // ✅ Good - tree-shakeable
   import { ApiClient } from '@friggframework/ui-core/api'
   
   // ❌ Bad - imports everything
   import * as FriggCore from '@friggframework/ui-core'
   ```

2. **Use dynamic imports for large features**:
   ```javascript
   // ✅ Good - code splitting
   const AdminPanel = lazy(() => import('./AdminPanel'))
   
   // ❌ Bad - increases main bundle
   import AdminPanel from './AdminPanel'
   ```

3. **Leverage framework-specific optimizations**:
   ```javascript
   // Vue: Use async components
   const HeavyComponent = defineAsyncComponent(() => import('./HeavyComponent.vue'))
   
   // React: Use React.lazy
   const HeavyComponent = React.lazy(() => import('./HeavyComponent'))
   
   // Svelte: Use dynamic imports
   let HeavyComponent
   onMount(async () => {
     const module = await import('./HeavyComponent.svelte')
     HeavyComponent = module.default
   })
   ```

## ⚡ Runtime Performance Optimization

### Performance Monitoring

Each framework includes built-in performance monitoring:

#### React
```javascript
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor'

function MyComponent() {
  const { metrics, isPerformanceGood } = usePerformanceMonitor('MyComponent')
  
  // Component logic...
  
  return <div>...</div>
}
```

#### Vue
```javascript
import { usePerformanceMonitor } from '@/composables/usePerformanceMonitor'

export default {
  setup() {
    const { metrics, isPerformanceGood } = usePerformanceMonitor('MyComponent')
    return { metrics, isPerformanceGood }
  }
}
```

#### Svelte
```javascript
import { createPerformanceMonitor } from '$lib/stores/performanceMonitor'

const monitor = createPerformanceMonitor('MyComponent')
monitor.initialize()
```

#### Angular
```typescript
import { PerformanceMonitorService } from './services/performance-monitor.service'

@Component({
  template: '<div performanceMonitor="MyComponent">...</div>'
})
export class MyComponent {
  constructor(private perf: PerformanceMonitorService) {
    this.perf.startRenderTracking('MyComponent')
  }
}
```

### Performance Best Practices

1. **Minimize re-renders**:
   - Use `React.memo`, `Vue.computed`, or Svelte reactive statements
   - Implement proper dependency tracking

2. **Optimize API calls**:
   ```javascript
   // Use the built-in API client with caching
   import { ApiClient } from '@friggframework/ui-core/api'
   
   const apiClient = new ApiClient({
     baseURL: '/api',
     cache: true,
     timeout: 5000
   })
   ```

3. **Implement virtual scrolling for large lists**:
   ```javascript
   // Use virtual scrolling libraries for lists > 100 items
   // React: react-window
   // Vue: vue-virtual-scroll-list
   // Svelte: svelte-virtual-list
   ```

## 🔧 Build Performance Optimization

### Development Builds

Optimized development configurations provide:
- Fast hot module replacement (HMR)
- Source maps for debugging
- Unminified code for easier debugging
- Vendor chunk splitting

### Production Builds

Production builds include:
- Terser minification with aggressive optimization
- Tree shaking to remove unused code
- Code splitting for optimal caching
- Asset optimization and compression

### Build Time Optimization

1. **Use proper caching**:
   ```bash
   # Enable npm cache
   npm config set cache ~/.npm-cache
   
   # Use build cache in CI
   - uses: actions/cache@v3
     with:
       path: node_modules
       key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
   ```

2. **Parallel builds**:
   ```bash
   # Build packages in parallel (when possible)
   npm run build:parallel
   ```

3. **Incremental builds**:
   - Only rebuild changed packages
   - Use watch mode during development

## 📊 Performance Monitoring & CI

### Automated Performance Testing

The project includes comprehensive performance monitoring:

1. **Daily Performance Benchmarks**: 
   - Automated via GitHub Actions
   - Tests all framework packages and templates
   - Generates performance reports

2. **Bundle Size Tracking**:
   - Tracks bundle size changes in PRs
   - Fails CI if bundle size increases significantly
   - Generates bundle analysis reports

3. **Lighthouse Performance Audits**:
   - Tests Core Web Vitals
   - Validates accessibility and SEO
   - Monitors performance regressions

### Performance Metrics Dashboard

Access performance metrics through:
- CI artifacts in GitHub Actions
- Generated performance reports
- Bundle analyzer outputs

## 🚨 Performance Troubleshooting

### Common Issues and Solutions

1. **Large Bundle Size**:
   ```bash
   # Analyze what's contributing to bundle size
   npm run build:analyze
   
   # Check for duplicate dependencies
   npm ls --depth=0
   
   # Use bundle analyzer to identify heavy imports
   ```

2. **Slow Build Times**:
   ```bash
   # Profile build performance
   npm run build -- --profile
   
   # Check for large dependencies
   npm audit
   
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json && npm install
   ```

3. **Poor Runtime Performance**:
   ```bash
   # Use built-in performance monitoring
   # Check browser DevTools Performance tab
   # Profile component render times
   ```

### Performance Debugging Tools

1. **Bundle Analysis**:
   - Webpack Bundle Analyzer
   - Rollup Plugin Visualizer
   - Source Map Explorer

2. **Runtime Profiling**:
   - Browser DevTools Performance tab
   - React DevTools Profiler
   - Vue DevTools Performance

3. **Network Performance**:
   - Lighthouse CI
   - WebPageTest
   - Chrome DevTools Network tab

## 📈 Performance Benchmarks

### Current Performance Metrics

Last updated: 2024-06-25

| Package | Bundle Size | Build Time | Performance Score |
|---------|-------------|------------|-------------------|
| ui-core | 85KB | 8.2s | 92/100 |
| ui-react | +12KB | 6.1s | 89/100 |
| ui-vue | +8KB | 5.8s | 91/100 |
| ui-svelte | +6KB | 5.2s | 94/100 |
| ui-angular | +18KB | 12.4s | 87/100 |

### Template Performance

| Template | Bundle Size | Build Time | LCP | Performance Score |
|----------|-------------|------------|-----|-------------------|
| React | 487KB | 24.1s | 1.8s | 89/100 |
| Vue | 423KB | 18.7s | 1.6s | 92/100 |
| Svelte | 312KB | 15.2s | 1.4s | 95/100 |
| Angular | 612KB | 45.3s | 2.1s | 85/100 |

## 🎛️ Configuration Reference

### Vite Configuration

The optimized Vite configuration includes:

```javascript
export default defineConfig({
  build: {
    // Terser minification with aggressive optimization
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.warn'],
        reduce_vars: true,
        passes: 2
      }
    },
    
    // Code splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          frigg: ['@friggframework/ui-core']
        }
      }
    },
    
    // Performance thresholds
    chunkSizeWarningLimit: 500,
    assetsInlineLimit: 4096
  }
})
```

### Angular Configuration

Production optimization settings:

```json
{
  "optimization": true,
  "outputHashing": "all",
  "sourceMap": false,
  "namedChunks": false,
  "extractLicenses": true,
  "vendorChunk": false,
  "buildOptimizer": true
}
```

## 📚 Additional Resources

- [Web.dev Performance](https://web.dev/performance/)
- [Vite Performance Guide](https://vitejs.dev/guide/performance.html)
- [Angular Performance Guide](https://angular.io/guide/performance-checklist)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Vue Performance Guide](https://vuejs.org/guide/best-practices/performance.html)
- [Svelte Performance](https://svelte.dev/docs/performance-tips)

## 🤝 Contributing to Performance

When contributing to Frigg:

1. **Run performance benchmarks** before submitting PRs
2. **Keep bundle sizes minimal** - avoid unnecessary dependencies
3. **Test performance** across all supported frameworks
4. **Document performance implications** of new features
5. **Monitor CI performance checks** and fix any regressions

For questions about performance optimization, please refer to our [Support Guide](../support/README.md).