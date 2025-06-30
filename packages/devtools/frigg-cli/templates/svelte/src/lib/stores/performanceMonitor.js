import { writable, derived } from 'svelte/store';
import { onMount } from 'svelte';

/**
 * Performance monitoring store for Svelte components
 * Tracks component render times, bundle sizes, and web vitals
 */
export function createPerformanceMonitor(componentName = 'Unknown') {
  const metrics = writable({
    renderTime: 0,
    bundleSize: null,
    lcp: null,
    fid: null,
    cls: null,
    renderCount: 0
  });

  const isPerformanceGood = derived(metrics, ($metrics) => ({
    lcp: $metrics.lcp ? $metrics.lcp < 2500 : null,
    fid: $metrics.fid ? $metrics.fid < 100 : null,
    cls: $metrics.cls !== null ? $metrics.cls < 0.1 : null,
    renderTime: $metrics.renderTime < 16 // 60fps target
  }));

  let renderStartTime = Date.now();
  let renderCount = 0;
  let observers = [];

  const trackRenderTime = () => {
    const renderEndTime = Date.now();
    const renderTime = renderEndTime - renderStartTime;
    renderCount += 1;

    metrics.update(current => ({
      ...current,
      renderTime,
      renderCount
    }));
  };

  const setupWebVitalsTracking = () => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      metrics.update(current => ({
        ...current,
        lcp: lastEntry.startTime
      }));
    });
    
    try {
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      observers.push(lcpObserver);
    } catch (e) {
      console.warn('LCP observation not supported');
    }

    // First Input Delay (FID)
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        const fidValue = entry.processingStart - entry.startTime;
        metrics.update(current => ({
          ...current,
          fid: fidValue
        }));
      });
    });
    
    try {
      fidObserver.observe({ entryTypes: ['first-input'] });
      observers.push(fidObserver);
    } catch (e) {
      console.warn('FID observation not supported');
    }

    // Cumulative Layout Shift (CLS)
    const clsObserver = new PerformanceObserver((entryList) => {
      let clsValue = 0;
      entryList.getEntries().forEach(entry => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      });
      metrics.update(current => ({
        ...current,
        cls: clsValue
      }));
    });
    
    try {
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      observers.push(clsObserver);
    } catch (e) {
      console.warn('CLS observation not supported');
    }
  };

  const estimateBundleSize = () => {
    if (typeof window !== 'undefined' && window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      const scripts = resources.filter(resource => resource.name.includes('.js'));
      const totalSize = scripts.reduce((sum, script) => sum + (script.transferSize || 0), 0);
      
      metrics.update(current => ({
        ...current,
        bundleSize: totalSize
      }));
    }
  };

  const initialize = () => {
    renderStartTime = Date.now();
    
    // Use setTimeout to track after component renders
    setTimeout(() => {
      trackRenderTime();
      setupWebVitalsTracking();
      estimateBundleSize();

      // Development logging
      if (process.env.NODE_ENV === 'development') {
        metrics.subscribe(current => {
          console.group(`🔍 Performance Metrics - ${componentName}`);
          console.log(`Render Time: ${current.renderTime}ms`);
          console.log(`Render Count: ${current.renderCount}`);
          if (current.lcp) console.log(`LCP: ${current.lcp.toFixed(2)}ms`);
          if (current.fid) console.log(`FID: ${current.fid.toFixed(2)}ms`);
          if (current.cls !== null) console.log(`CLS: ${current.cls.toFixed(4)}`);
          if (current.bundleSize) console.log(`Estimated Bundle Size: ${(current.bundleSize / 1024).toFixed(2)}KB`);
          console.groupEnd();
        });
      }
    }, 0);
  };

  const cleanup = () => {
    observers.forEach(observer => observer.disconnect());
    observers = [];
  };

  const updateRenderTime = () => {
    renderStartTime = Date.now();
    setTimeout(trackRenderTime, 0);
  };

  return {
    metrics,
    isPerformanceGood,
    initialize,
    cleanup,
    updateRenderTime
  };
}

/**
 * Action for automatic performance monitoring
 */
export function performanceMonitor(node, componentName = 'Unknown') {
  const monitor = createPerformanceMonitor(componentName);
  
  monitor.initialize();

  // Track updates
  const mutationObserver = new MutationObserver(() => {
    monitor.updateRenderTime();
  });

  mutationObserver.observe(node, {
    childList: true,
    subtree: true,
    attributes: true
  });

  return {
    destroy() {
      monitor.cleanup();
      mutationObserver.disconnect();
    }
  };
}