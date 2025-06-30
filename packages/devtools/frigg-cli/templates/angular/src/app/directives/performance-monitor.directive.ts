import { Directive, Input, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { PerformanceMonitorService } from '../services/performance-monitor.service';

/**
 * Directive to automatically monitor component performance
 * Usage: <component performanceMonitor="ComponentName">
 */
@Directive({
  selector: '[performanceMonitor]',
  standalone: true
})
export class PerformanceMonitorDirective implements OnInit, OnDestroy, AfterViewInit {
  @Input('performanceMonitor') componentName: string = 'Unknown';

  constructor(private performanceService: PerformanceMonitorService) {}

  ngOnInit(): void {
    this.performanceService.startRenderTracking(this.componentName);
  }

  ngAfterViewInit(): void {
    // Track after view initialization (render complete)
    setTimeout(() => {
      this.performanceService.endRenderTracking(this.componentName);
    }, 0);
  }

  ngOnDestroy(): void {
    // Could track component destruction time if needed
  }
}