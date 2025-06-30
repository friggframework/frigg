import { ref, onMounted, onUpdated, nextTick } from 'vue';

/**
 * Performance monitoring composable for Vue components
 * Tracks component render times, bundle sizes, and web vitals
 */
export function usePerformanceMonitor(componentName = 'Unknown') {
  const metrics = ref({
    renderTime: 0,
    bundleSize: null,
    lcp: null,
    fid: null,
    cls: null,
    renderCount: 0
  });

  const isPerformanceGood = ref({
    lcp: null,
    fid: null,
    cls: null,
    renderTime: true
  });

  let renderStartTime = Date.now();
  let renderCount = 0;

  const trackRenderTime = async () => {
    await nextTick();
    const renderEndTime = Date.now();
    const renderTime = renderEndTime - renderStartTime;
    renderCount += 1;

    metrics.value = {
      ...metrics.value,
      renderTime,
      renderCount
    };

    isPerformanceGood.value.renderTime = renderTime < 16; // 60fps target
  };

  const setupWebVitalsTracking = () => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      metrics.value.lcp = lastEntry.startTime;
      isPerformanceGood.value.lcp = lastEntry.startTime < 2500;
    });
    
    try {
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('LCP observation not supported');
    }

    // First Input Delay (FID)
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        const fidValue = entry.processingStart - entry.startTime;
        metrics.value.fid = fidValue;
        isPerformanceGood.value.fid = fidValue < 100;
      });
    });
    
    try {
      fidObserver.observe({ entryTypes: ['first-input'] });
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
      metrics.value.cls = clsValue;
      isPerformanceGood.value.cls = clsValue < 0.1;
    });
    
    try {
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.warn('CLS observation not supported');
    }

    return () => {
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  };

  const estimateBundleSize = () => {
    if (typeof window !== 'undefined' && window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      const scripts = resources.filter(resource => resource.name.includes('.js'));
      const totalSize = scripts.reduce((sum, script) => sum + (script.transferSize || 0), 0);
      
      metrics.value.bundleSize = totalSize;
    }
  };

  onMounted(() => {
    renderStartTime = Date.now();
    trackRenderTime();
    const cleanup = setupWebVitalsTracking();
    estimateBundleSize();

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔍 Performance Metrics - ${componentName}`);
      console.log(`Component: ${componentName}`);
    }

    return cleanup;
  });

  onUpdated(() => {
    renderStartTime = Date.now();
    trackRenderTime();
  });

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    watch(metrics, (newMetrics) => {
      console.group(`📊 Performance Update - ${componentName}`);
      console.log(`Render Time: ${newMetrics.renderTime}ms`);
      console.log(`Render Count: ${newMetrics.renderCount}`);
      if (newMetrics.lcp) console.log(`LCP: ${newMetrics.lcp.toFixed(2)}ms`);
      if (newMetrics.fid) console.log(`FID: ${newMetrics.fid.toFixed(2)}ms`);
      if (newMetrics.cls !== null) console.log(`CLS: ${newMetrics.cls.toFixed(4)}`);
      if (newMetrics.bundleSize) console.log(`Estimated Bundle Size: ${(newMetrics.bundleSize / 1024).toFixed(2)}KB`);
      console.groupEnd();
    }, { deep: true });
  }

  return {
    metrics,
    isPerformanceGood
  };
}