/**
 * Public API Surface of @friggframework/ui-angular
 * This file defines all exports for the Angular package
 */

// Services
export * from './services/toast.service';
export * from './services/api.service';
export * from './services/alerts.service';
export * from './services/cloudwatch.service';

// Components
export * from './components/toast/toast.component';
export * from './components/toast/toast-container.component';
export * from './components/loading/loading-spinner.component';
export * from './components/modal/modal.component';
export * from './components/integration/integration-card.component';
export * from './components/alerts/alerts-panel.component';

// Plugin
export * from './plugins/angular-plugin';

// Module
export * from './lib/frigg-ui.module';

// Providers for standalone components
export * from './lib/providers';

// Re-export commonly used types from ui-core
export { AlertsService as CoreAlertsService } from '@friggframework/ui-core/services';
export { CloudWatchService as CoreCloudWatchService } from '@friggframework/ui-core/services';
export { ToastManager } from '@friggframework/ui-core/state';
export type { FrameworkPlugin, FrameworkAdapter } from '@friggframework/ui-core/plugins';