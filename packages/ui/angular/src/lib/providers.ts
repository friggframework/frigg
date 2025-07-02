/**
 * Angular providers for standalone usage
 * Provides configuration for applications using standalone components
 */

import { 
  Provider, 
  EnvironmentProviders, 
  makeEnvironmentProviders,
  InjectionToken,
  inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';

// Services
import { 
  ToastService,
  ApiService,
  AlertsService,
  CloudWatchService
} from '../services';

// Plugin
import { AngularPlugin, createAngularPlugin } from '../plugins/angular-plugin';

// Configuration
export interface FriggProviderConfig {
  apiBaseUrl?: string;
  authToken?: string;
  enableDevTools?: boolean;
}

export const FRIGG_PROVIDER_CONFIG = new InjectionToken<FriggProviderConfig>('FRIGG_PROVIDER_CONFIG');

/**
 * Factory function to initialize ApiService with configuration
 */
export function apiServiceFactory(
  http: HttpClient,
  config: FriggProviderConfig
): ApiService {
  const service = new ApiService(http);
  
  if (config.apiBaseUrl) {
    service.setBaseUrl(config.apiBaseUrl);
  }
  
  if (config.authToken) {
    service.setAuthToken(config.authToken);
  }
  
  return service;
}

/**
 * Provide Frigg UI services for standalone components
 */
export function provideFriggUi(
  config?: FriggProviderConfig
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FRIGG_PROVIDER_CONFIG,
      useValue: config || {}
    },
    ToastService,
    {
      provide: ApiService,
      useFactory: apiServiceFactory,
      deps: [HttpClient, FRIGG_PROVIDER_CONFIG]
    },
    AlertsService,
    CloudWatchService,
    {
      provide: AngularPlugin,
      useFactory: createAngularPlugin,
      deps: ['$injector', 'ngZone']
    }
  ]);
}

/**
 * Individual service providers for selective imports
 */
export const TOAST_PROVIDERS: Provider[] = [
  ToastService
];

export const API_PROVIDERS: Provider[] = [
  {
    provide: ApiService,
    useFactory: apiServiceFactory,
    deps: [HttpClient, FRIGG_PROVIDER_CONFIG]
  }
];

export const ALERTS_PROVIDERS: Provider[] = [
  AlertsService,
  {
    provide: ApiService,
    useFactory: apiServiceFactory,
    deps: [HttpClient, FRIGG_PROVIDER_CONFIG]
  }
];

export const CLOUDWATCH_PROVIDERS: Provider[] = [
  CloudWatchService,
  {
    provide: ApiService,
    useFactory: apiServiceFactory,
    deps: [HttpClient, FRIGG_PROVIDER_CONFIG]
  }
];

/**
 * Helper function to configure API service in application
 */
export function configureFriggApi(
  baseUrl: string,
  authToken?: string
): Provider[] {
  return [
    {
      provide: FRIGG_PROVIDER_CONFIG,
      useValue: { apiBaseUrl: baseUrl, authToken }
    },
    {
      provide: ApiService,
      useFactory: apiServiceFactory,
      deps: [HttpClient, FRIGG_PROVIDER_CONFIG]
    }
  ];
}