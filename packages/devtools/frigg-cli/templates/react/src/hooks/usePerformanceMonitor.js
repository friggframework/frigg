import { useState, useEffect, useRef } from 'react';

/**
 * Performance monitoring hook for React components
 * Tracks component render times, bundle sizes, and web vitals
 */
export function usePerformanceMonitor(componentName = 'Unknown') {
  const [metrics, setMetrics] = useState({
    renderTime: 0,
    bundleSize: null,
    lcp: null,
    fid: null,
    cls: null,
    renderCount: 0
  });
  
  const renderStartTime = useRef(Date.now());
  const renderCountRef = useRef(0);

  useEffect(() => {
    // Track render completion time
    const renderEndTime = Date.now();
    const renderTime = renderEndTime - renderStartTime.current;
    renderCountRef.current += 1;

    setMetrics(prev => ({
      ...prev,
      renderTime,
      renderCount: renderCountRef.current
    }));

    // Web Vitals tracking (if available)
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        setMetrics(prev => ({ ...prev, lcp: lastEntry.startTime }));
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
          setMetrics(prev => ({ ...prev, fid: entry.processingStart - entry.startTime }));
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
        setMetrics(prev => ({ ...prev, cls: clsValue }));
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
    }
  }, []);

  // Bundle size estimation (rough approximation)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      const scripts = resources.filter(resource => resource.name.includes('.js'));
      const totalSize = scripts.reduce((sum, script) => sum + (script.transferSize || 0), 0);
      
      setMetrics(prev => ({ ...prev, bundleSize: totalSize }));
    }
  }, []);

  // Console logging for development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔍 Performance Metrics - ${componentName}`);
      console.log(`Render Time: ${metrics.renderTime}ms`);
      console.log(`Render Count: ${metrics.renderCount}`);
      if (metrics.lcp) console.log(`LCP: ${metrics.lcp.toFixed(2)}ms`);
      if (metrics.fid) console.log(`FID: ${metrics.fid.toFixed(2)}ms`);
      if (metrics.cls !== null) console.log(`CLS: ${metrics.cls.toFixed(4)}`);
      if (metrics.bundleSize) console.log(`Estimated Bundle Size: ${(metrics.bundleSize / 1024).toFixed(2)}KB`);
      console.groupEnd();
    }
  }, [componentName, metrics]);

  return {
    metrics,
    isPerformanceGood: {
      lcp: metrics.lcp ? metrics.lcp < 2500 : null,
      fid: metrics.fid ? metrics.fid < 100 : null,
      cls: metrics.cls !== null ? metrics.cls < 0.1 : null,
      renderTime: metrics.renderTime < 16 // 60fps target
    }
  };
}

/**
 * HOC for performance monitoring
 */
export function withPerformanceMonitor(WrappedComponent, componentName) {
  return function PerformanceMonitoredComponent(props) {
    const { metrics, isPerformanceGood } = usePerformanceMonitor(componentName);
    
    return (
      <>
        <WrappedComponent {...props} />
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 9999,
            fontFamily: 'monospace'
          }}>
            <div>{componentName}</div>
            <div>Render: {metrics.renderTime}ms {isPerformanceGood.renderTime ? '✅' : '⚠️'}</div>
            {metrics.lcp && <div>LCP: {metrics.lcp.toFixed(0)}ms {isPerformanceGood.lcp ? '✅' : '⚠️'}</div>}
            {metrics.bundleSize && <div>Bundle: {(metrics.bundleSize / 1024).toFixed(1)}KB</div>}
          </div>
        )}
      </>
    );
  };
}