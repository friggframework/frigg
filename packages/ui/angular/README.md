# @friggframework/ui-angular

Angular bindings and components for the Frigg integration platform UI.

## Installation

```bash
npm install @friggframework/ui-angular @friggframework/ui-core
```

## Features

- 🎯 **Full Angular Integration** - Native Angular services and components
- 🔄 **RxJS Observables** - Reactive patterns throughout
- 🎨 **Standalone Components** - Use with or without modules
- 💉 **Dependency Injection** - Full Angular DI support
- 🌐 **Zone.js Integration** - Proper change detection
- 🧪 **Fully Tested** - Jasmine/Karma test suite

## Quick Start

### Module Setup (Traditional)

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FriggUiModule } from '@friggframework/ui-angular';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FriggUiModule.forRoot({
      apiBaseUrl: 'https://api.frigg.com',
      authToken: 'your-auth-token'
    })
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Standalone Setup (Modern)

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideFriggUi } from '@friggframework/ui-angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(),
    provideFriggUi({
      apiBaseUrl: 'https://api.frigg.com',
      authToken: 'your-auth-token'
    })
  ]
});
```

## Services

### Toast Service

Display toast notifications with full RxJS support:

```typescript
import { Component } from '@angular/core';
import { ToastService } from '@friggframework/ui-angular';

@Component({
  selector: 'app-example',
  template: `
    <frigg-toast-container></frigg-toast-container>
    <button (click)="showToast()">Show Toast</button>
  `
})
export class ExampleComponent {
  constructor(private toastService: ToastService) {
    // Subscribe to toast events
    this.toastService.toastAdded$.subscribe(toast => {
      console.log('New toast:', toast);
    });
  }

  showToast() {
    // Simple toast
    this.toastService.success('Success!', 'Operation completed');
    
    // With action
    this.toastService.show({
      title: 'File uploaded',
      description: 'document.pdf',
      variant: 'success',
      action: {
        label: 'View',
        onClick: () => console.log('View clicked')
      }
    });
    
    // Promise toast
    this.toastService.promise(
      this.uploadFile(),
      {
        loading: 'Uploading...',
        success: 'Upload complete!',
        error: 'Upload failed'
      }
    );
  }
}
```

### API Service

Angular HttpClient wrapper with authentication:

```typescript
import { Component, OnInit } from '@angular/core';
import { ApiService } from '@friggframework/ui-angular';

@Component({
  selector: 'app-integrations',
  template: `
    <div *ngFor="let integration of integrations$ | async">
      {{ integration.name }}
    </div>
  `
})
export class IntegrationsComponent implements OnInit {
  integrations$ = this.apiService.listIntegrations();

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // Configure API
    this.apiService.setBaseUrl('https://api.frigg.com');
    this.apiService.setAuthToken('your-token');
    
    // Subscribe to auth state
    this.apiService.isAuthenticated$.subscribe(isAuth => {
      console.log('Authenticated:', isAuth);
    });
  }

  createIntegration() {
    this.apiService.createIntegration(
      { type: 'salesforce', id: 'sf-123' },
      { type: 'hubspot', id: 'hs-456' },
      { syncInterval: 3600 }
    ).subscribe(
      integration => console.log('Created:', integration),
      error => console.error('Error:', error)
    );
  }
}
```

### Alerts Service

Real-time alert management:

```typescript
import { Component, OnInit } from '@angular/core';
import { AlertsService } from '@friggframework/ui-angular';

@Component({
  selector: 'app-alerts',
  template: `
    <frigg-alerts-panel
      [integrationId]="integrationId"
      [autoRefresh]="true"
      [refreshInterval]="30000"
    ></frigg-alerts-panel>
  `
})
export class AlertsComponent implements OnInit {
  integrationId = 'int-123';

  constructor(private alertsService: AlertsService) {}

  ngOnInit() {
    // Subscribe to alert counts
    this.alertsService.alertCounts$.subscribe(counts => {
      console.log('Active alerts:', counts.active);
      console.log('Critical alerts:', counts.critical);
    });
    
    // Subscribe to new alerts
    this.alertsService.alertAdded$.subscribe(alert => {
      if (alert.severity === 'critical') {
        // Handle critical alert
      }
    });
    
    // Filter alerts
    this.alertsService.filterBySeverity('critical').subscribe(
      criticalAlerts => console.log('Critical:', criticalAlerts)
    );
  }
}
```

### CloudWatch Service

Monitor metrics and performance:

```typescript
import { Component, OnInit } from '@angular/core';
import { CloudWatchService } from '@friggframework/ui-angular';

@Component({
  selector: 'app-metrics',
  template: `
    <div *ngIf="summary$ | async as summary">
      <p>Latency: {{ summary.avgLatency }}ms</p>
      <p>Error Rate: {{ summary.errorRate }}%</p>
      <p>Uptime: {{ summary.uptime }}%</p>
    </div>
  `
})
export class MetricsComponent implements OnInit {
  summary$ = this.cloudWatchService.summary$;

  constructor(private cloudWatchService: CloudWatchService) {}

  ngOnInit() {
    // Fetch metrics
    this.cloudWatchService.fetchMetrics({
      integrationId: 'int-123',
      startTime: new Date(Date.now() - 86400000),
      endTime: new Date()
    }).subscribe();
    
    // Subscribe to health status
    this.cloudWatchService.healthStatus$.subscribe(status => {
      console.log('Health:', status); // 'healthy' | 'degraded' | 'critical'
    });
    
    // Get specific metric stats
    this.cloudWatchService.getMetricStats('latency').subscribe(stats => {
      console.log('Min:', stats.min, 'Max:', stats.max, 'Avg:', stats.avg);
    });
  }
}
```

## Components

### Toast Components

```typescript
import { Component } from '@angular/core';
import { FriggToastContainerComponent } from '@friggframework/ui-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FriggToastContainerComponent],
  template: `
    <!-- Toast container manages all toasts -->
    <frigg-toast-container></frigg-toast-container>
  `
})
export class AppComponent {}
```

### Loading Spinner

```typescript
import { Component } from '@angular/core';
import { FriggLoadingSpinnerComponent } from '@friggframework/ui-angular';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [FriggLoadingSpinnerComponent],
  template: `
    <!-- Inline spinner -->
    <frigg-loading-spinner 
      [size]="'small'"
      [inline]="true"
      [text]="'Loading...'"
    ></frigg-loading-spinner>
    
    <!-- Full overlay spinner -->
    <frigg-loading-spinner 
      [overlay]="true"
      [text]="'Processing...'"
    ></frigg-loading-spinner>
  `
})
export class LoadingComponent {}
```

### Modal Component

```typescript
import { Component } from '@angular/core';
import { FriggModalComponent } from '@friggframework/ui-angular';

@Component({
  selector: 'app-modal-demo',
  standalone: true,
  imports: [FriggModalComponent],
  template: `
    <frigg-modal
      [isOpen]="isModalOpen"
      [title]="'Confirm Action'"
      [size]="'medium'"
      [showFooter]="true"
      (close)="isModalOpen = false"
    >
      <p>Are you sure you want to proceed?</p>
      
      <div modal-footer>
        <button (click)="isModalOpen = false">Cancel</button>
        <button (click)="confirm()">Confirm</button>
      </div>
    </frigg-modal>
  `
})
export class ModalDemoComponent {
  isModalOpen = false;
  
  confirm() {
    console.log('Confirmed!');
    this.isModalOpen = false;
  }
}
```

### Integration Card

```typescript
import { Component } from '@angular/core';
import { FriggIntegrationCardComponent } from '@friggframework/ui-angular';

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [FriggIntegrationCardComponent],
  template: `
    <frigg-integration-card
      [integration]="integration"
      [showMetrics]="true"
      [showActions]="true"
      (configure)="onConfigure($event)"
      (view)="onView($event)"
      (sync)="onSync($event)"
    ></frigg-integration-card>
  `
})
export class IntegrationsComponent {
  integration = {
    id: 'int-123',
    name: 'Salesforce to HubSpot',
    status: 'active',
    entities: [
      { id: 'sf-1', type: 'salesforce', name: 'Salesforce', status: 'connected' },
      { id: 'hs-1', type: 'hubspot', name: 'HubSpot', status: 'connected' }
    ],
    metrics: {
      syncedRecords: 1523,
      errors: 0
    },
    lastSync: new Date()
  };
  
  onConfigure(integration: any) {
    console.log('Configure:', integration);
  }
  
  onView(integration: any) {
    console.log('View:', integration);
  }
  
  onSync(integration: any) {
    console.log('Sync:', integration);
  }
}
```

### Alerts Panel

```typescript
import { Component } from '@angular/core';
import { FriggAlertsPanelComponent } from '@friggframework/ui-angular';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [FriggAlertsPanelComponent],
  template: `
    <frigg-alerts-panel
      [integrationId]="'int-123'"
      [limit]="20"
      [autoRefresh]="true"
      [refreshInterval]="30000"
      [currentUserId]="'user-456'"
    ></frigg-alerts-panel>
  `
})
export class AlertsComponent {}
```

## Angular Plugin

The Angular plugin provides framework integration:

```typescript
import { Component, Injector, NgZone } from '@angular/core';
import { AngularPlugin } from '@friggframework/ui-angular';
import { PluginManager } from '@friggframework/ui-core/plugins';

@Component({
  selector: 'app-plugin-demo'
})
export class PluginDemoComponent {
  constructor(
    private injector: Injector,
    private ngZone: NgZone
  ) {
    // Create and register Angular plugin
    const angularPlugin = new AngularPlugin(injector, ngZone);
    angularPlugin.initialize();
    
    const pluginManager = new PluginManager();
    pluginManager.register(angularPlugin);
    pluginManager.activate('angular');
    
    // Use framework-agnostic features
    const stateAdapter = pluginManager.getAdapter('state');
    const state$ = stateAdapter.create({ count: 0 });
    
    state$.subscribe(value => {
      console.log('State updated:', value);
    });
  }
}
```

## Testing

The package includes comprehensive tests using Jasmine and Karma:

```bash
# Run tests
npm test

# Run tests in headless mode
npm run test:headless

# Generate coverage report
npm run test -- --code-coverage
```

Example test:

```typescript
import { TestBed } from '@angular/core/testing';
import { ToastService } from '@friggframework/ui-angular';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('should show success toast', () => {
    const toast = service.success('Test', 'Success message');
    expect(toast.variant).toBe('success');
    expect(toast.title).toBe('Test');
  });
});
```

## Migration Guide

### From React/Vue/Svelte

The Angular package provides similar APIs with RxJS observables:

```typescript
// React: const toasts = useToasts()
// Angular:
constructor(private toastService: ToastService) {}
toasts$ = this.toastService.toasts$;

// React: showToast({ title: 'Hello' })
// Angular:
this.toastService.show({ title: 'Hello' });

// React: const { data } = useIntegrations()
// Angular:
integrations$ = this.apiService.listIntegrations();
```

### From AngularJS

Modern Angular patterns with standalone components:

```typescript
// AngularJS: angular.module('app').service('toastService', ...)
// Angular:
import { ToastService } from '@friggframework/ui-angular';

// AngularJS: $scope.$watch('alerts', ...)
// Angular:
this.alertsService.alerts$.subscribe(alerts => ...);
```

## License

MIT