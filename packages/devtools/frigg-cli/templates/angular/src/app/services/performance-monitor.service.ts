import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface PerformanceMetrics {
  renderTime: number;
  bundleSize: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  renderCount: number;
}

export interface PerformanceStatus {
  lcp: boolean | null;
  fid: boolean | null;
  cls: boolean | null;
  renderTime: boolean;
}

/**
 * Performance monitoring service for Angular components
 * Tracks component render times, bundle sizes, and web vitals
 */
@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService implements OnDestroy {
  private readonly metricsSubject = new BehaviorSubject<PerformanceMetrics>({
    renderTime: 0,
    bundleSize: null,
    lcp: null,
    fid: null,
    cls: null,
    renderCount: 0
  });

  private readonly performanceStatusSubject = new BehaviorSubject<PerformanceStatus>({
    lcp: null,
    fid: null,
    cls: null,
    renderTime: true
  });

  private observers: PerformanceObserver[] = [];
  private componentMetrics = new Map<string, { startTime: number; renderCount: number }>();

  constructor() {
    this.setupWebVitalsTracking();
    this.estimateBundleSize();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Get observable of performance metrics
   */
  getMetrics(): Observable<PerformanceMetrics> {
    return this.metricsSubject.asObservable();
  }

  /**
   * Get observable of performance status (good/bad thresholds)
   */
  getPerformanceStatus(): Observable<PerformanceStatus> {
    return this.performanceStatusSubject.asObservable();
  }

  /**
   * Start tracking render time for a component
   */
  startRenderTracking(componentName: string): void {
    const existing = this.componentMetrics.get(componentName) || { startTime: 0, renderCount: 0 };
    this.componentMetrics.set(componentName, {
      startTime: Date.now(),
      renderCount: existing.renderCount
    });
  }

  /**
   * End tracking render time for a component
   */
  endRenderTracking(componentName: string): void {
    const componentData = this.componentMetrics.get(componentName);
    if (!componentData) return;

    const renderEndTime = Date.now();
    const renderTime = renderEndTime - componentData.startTime;
    const renderCount = componentData.renderCount + 1;

    // Update component data
    this.componentMetrics.set(componentName, {
      ...componentData,
      renderCount
    });

    // Update metrics
    const currentMetrics = this.metricsSubject.value;
    const newMetrics: PerformanceMetrics = {
      ...currentMetrics,
      renderTime,
      renderCount
    };

    this.metricsSubject.next(newMetrics);
    this.updatePerformanceStatus(newMetrics);

    // Development logging
    if (!environment.production) {
      console.group(`🔍 Performance Metrics - ${componentName}`);
      console.log(`Render Time: ${renderTime}ms`);
      console.log(`Render Count: ${renderCount}`);
      console.log(`LCP: ${newMetrics.lcp?.toFixed(2) || 'N/A'}ms`);
      console.log(`FID: ${newMetrics.fid?.toFixed(2) || 'N/A'}ms`);
      console.log(`CLS: ${newMetrics.cls?.toFixed(4) || 'N/A'}`);
      console.log(`Bundle Size: ${newMetrics.bundleSize ? (newMetrics.bundleSize / 1024).toFixed(2) + 'KB' : 'N/A'}`);
      console.groupEnd();
    }
  }

  /**
   * Get current metrics value
   */
  getCurrentMetrics(): PerformanceMetrics {
    return this.metricsSubject.value;
  }

  /**
   * Get current performance status
   */
  getCurrentPerformanceStatus(): PerformanceStatus {
    return this.performanceStatusSubject.value;
  }

  private setupWebVitalsTracking(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      const lcpValue = lastEntry.startTime;
      
      const currentMetrics = this.metricsSubject.value;
      const newMetrics = { ...currentMetrics, lcp: lcpValue };
      
      this.metricsSubject.next(newMetrics);
      this.updatePerformanceStatus(newMetrics);
    });
    
    try {
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);
    } catch (e) {
      console.warn('LCP observation not supported');
    }

    // First Input Delay (FID)
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        const fidValue = entry.processingStart - entry.startTime;
        
        const currentMetrics = this.metricsSubject.value;
        const newMetrics = { ...currentMetrics, fid: fidValue };
        
        this.metricsSubject.next(newMetrics);
        this.updatePerformanceStatus(newMetrics);
      });
    });
    
    try {
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);
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
      
      const currentMetrics = this.metricsSubject.value;
      const newMetrics = { ...currentMetrics, cls: clsValue };
      
      this.metricsSubject.next(newMetrics);
      this.updatePerformanceStatus(newMetrics);
    });
    
    try {
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch (e) {
      console.warn('CLS observation not supported');
    }
  }

  private estimateBundleSize(): void {
    if (typeof window !== 'undefined' && window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      const scripts = resources.filter(resource => resource.name.includes('.js'));
      const totalSize = scripts.reduce((sum, script) => sum + (script.transferSize || 0), 0);
      
      const currentMetrics = this.metricsSubject.value;
      this.metricsSubject.next({ ...currentMetrics, bundleSize: totalSize });
    }
  }

  private updatePerformanceStatus(metrics: PerformanceMetrics): void {
    const status: PerformanceStatus = {
      lcp: metrics.lcp ? metrics.lcp < 2500 : null,
      fid: metrics.fid ? metrics.fid < 100 : null,
      cls: metrics.cls !== null ? metrics.cls < 0.1 : null,
      renderTime: metrics.renderTime < 16 // 60fps target
    };

    this.performanceStatusSubject.next(status);
  }

  private cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.componentMetrics.clear();
  }
}