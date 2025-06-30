/**
 * Angular Module for Frigg UI
 * Provides all components and services in a single module
 */

import { NgModule, ModuleWithProviders, InjectionToken } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

// Services
import { 
  ToastService,
  ApiService,
  AlertsService,
  CloudWatchService
} from '../services';

// Components
import {
  FriggToastComponent,
  FriggToastContainerComponent,
  FriggLoadingSpinnerComponent,
  FriggModalComponent,
  FriggIntegrationCardComponent,
  FriggAlertsPanelComponent
} from '../components';

// Plugin
import { AngularPlugin, createAngularPlugin } from '../plugins/angular-plugin';

// Configuration interfaces
export interface FriggUiConfig {
  apiBaseUrl?: string;
  authToken?: string;
  toastPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  theme?: 'light' | 'dark' | 'auto';
}

export const FRIGG_UI_CONFIG = new InjectionToken<FriggUiConfig>('FRIGG_UI_CONFIG');

// All components that should be exported
const COMPONENTS = [
  FriggToastComponent,
  FriggToastContainerComponent,
  FriggLoadingSpinnerComponent,
  FriggModalComponent,
  FriggIntegrationCardComponent,
  FriggAlertsPanelComponent
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    HttpClientModule,
    ...COMPONENTS // Import standalone components
  ],
  exports: [
    ...COMPONENTS // Export all components
  ]
})
export class FriggUiModule {
  /**
   * Configure the module with providers
   */
  static forRoot(config?: FriggUiConfig): ModuleWithProviders<FriggUiModule> {
    return {
      ngModule: FriggUiModule,
      providers: [
        {
          provide: FRIGG_UI_CONFIG,
          useValue: config || {}
        },
        ToastService,
        ApiService,
        AlertsService,
        CloudWatchService,
        {
          provide: AngularPlugin,
          useFactory: createAngularPlugin,
          deps: ['$injector', 'ngZone']
        }
      ]
    };
  }

  /**
   * Import module without providers (for feature modules)
   */
  static forChild(): ModuleWithProviders<FriggUiModule> {
    return {
      ngModule: FriggUiModule,
      providers: []
    };
  }
}