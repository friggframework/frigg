/**
 * Angular plugin adapter for @friggframework/ui-core
 * Implements FrameworkPlugin interface for Angular-specific functionality
 */

import { Injectable, Injector, NgZone, ApplicationRef } from '@angular/core';
import { 
  FrameworkPlugin, 
  FrameworkAdapter, 
  HOOKS, 
  COMPONENTS, 
  ADAPTERS 
} from '@friggframework/ui-core/plugins';
import { BehaviorSubject, Subject, Observable, from, of } from 'rxjs';
import { map, shareReplay, distinctUntilChanged } from 'rxjs/operators';

/**
 * Angular-specific adapter for framework integration
 */
export class AngularAdapter extends FrameworkAdapter {
  constructor(
    private injector: Injector,
    private ngZone: NgZone
  ) {
    super('angular');
  }

  // Angular reactive state management using RxJS
  createState<T>(initialState: T): BehaviorSubject<T> {
    return new BehaviorSubject<T>(initialState);
  }

  // Angular effect using RxJS subscriptions
  createEffect(callback: () => void, dependencies?: Observable<any>[]): () => void {
    if (dependencies && dependencies.length > 0) {
      // Combine dependencies and subscribe
      const subscription = dependencies[0].subscribe(() => {
        this.ngZone.run(() => callback());
      });
      
      return () => subscription.unsubscribe();
    }
    
    // Run immediately in Angular zone
    this.ngZone.run(() => callback());
    return () => {};
  }

  // Angular component creation helper
  createElement(type: any, props: Record<string, any> = {}, children: any[] = []) {
    return {
      type,
      props,
      children,
      framework: 'angular'
    };
  }

  // Angular event binding
  bindEvent(element: HTMLElement, event: string, handler: EventListener): () => void {
    if (element && element.addEventListener) {
      // Run event handler in Angular zone
      const wrappedHandler = (e: Event) => {
        this.ngZone.run(() => handler(e));
      };
      
      element.addEventListener(event, wrappedHandler);
      return () => element.removeEventListener(event, wrappedHandler);
    }
    return () => {};
  }

  // Angular-specific computed values using RxJS
  createComputed<T>(getter: () => T, dependencies: Observable<any>[] = []): Observable<T> {
    if (dependencies.length === 0) {
      return of(getter()).pipe(shareReplay(1));
    }
    
    // Create derived observable
    return dependencies[0].pipe(
      map(() => getter()),
      distinctUntilChanged(),
      shareReplay(1)
    );
  }

  // Angular change detection trigger
  detectChanges(): void {
    const appRef = this.injector.get(ApplicationRef);
    appRef.tick();
  }

  // Create Angular-compatible Subject
  createSubject<T>(): Subject<T> {
    return new Subject<T>();
  }

  // Run code outside Angular zone (for performance)
  runOutsideAngular<T>(fn: () => T): T {
    return this.ngZone.runOutsideAngular(fn);
  }

  // Run code inside Angular zone
  runInAngular<T>(fn: () => T): T {
    return this.ngZone.run(fn);
  }
}

/**
 * Angular Framework Plugin for ui-core
 */
@Injectable({
  providedIn: 'root'
})
export class AngularPlugin extends FrameworkPlugin {
  private adapter!: AngularAdapter;

  constructor(
    private injector: Injector,
    private ngZone: NgZone
  ) {
    super('angular', '17.x');
  }

  // Initialize the plugin
  initialize(): void {
    this.adapter = new AngularAdapter(this.injector, this.ngZone);
    this.setupHooks();
    this.setupAdapters();
  }

  private setupHooks(): void {
    // State management hook using RxJS
    this.registerHook(HOOKS.STATE_MANAGER, (initialState) => {
      return this.adapter.createState(initialState);
    });

    // Effect management hook using Angular zones
    this.registerHook(HOOKS.EFFECT_MANAGER, (callback, dependencies) => {
      return this.adapter.createEffect(callback, dependencies);
    });

    // Event management hook
    this.registerHook(HOOKS.EVENT_MANAGER, (element, event, handler) => {
      return this.adapter.bindEvent(element, event, handler);
    });

    // Component renderer hook for dynamic components
    this.registerHook(HOOKS.COMPONENT_RENDERER, (type, props, children) => {
      return this.adapter.createElement(type, props, children);
    });

    // HTTP client hook - delegate to Angular HttpClient via services
    this.registerHook(HOOKS.HTTP_CLIENT, (config) => {
      // This will be handled by Angular's HttpClient service
      return null;
    });
  }

  private setupAdapters(): void {
    // State adapter for RxJS observables
    this.registerAdapter(ADAPTERS.STATE, {
      create: <T>(initialState: T) => this.adapter.createState(initialState),
      behaviorSubject: <T>(value: T) => new BehaviorSubject<T>(value),
      subject: <T>() => new Subject<T>(),
      observable: <T>(value: T) => of(value),
      from: <T>(promise: Promise<T>) => from(promise),
      // Helper to convert observable to signal (for Angular 16+)
      toSignal: (observable: Observable<any>) => {
        // This would use Angular's toSignal function if available
        return observable;
      }
    });

    // Effects adapter for Angular lifecycle
    this.registerAdapter(ADAPTERS.EFFECTS, {
      // Run effect in Angular zone
      effect: (callback: () => void, dependencies?: Observable<any>[]) => 
        this.adapter.createEffect(callback, dependencies),
      // Run outside Angular for performance
      runOutsideAngular: <T>(fn: () => T) => this.adapter.runOutsideAngular(fn),
      // Trigger change detection
      detectChanges: () => this.adapter.detectChanges(),
      // Subscribe to observable
      subscribe: <T>(observable: Observable<T>, callback: (value: T) => void) => {
        const subscription = observable.subscribe(value => {
          this.ngZone.run(() => callback(value));
        });
        return () => subscription.unsubscribe();
      }
    });

    // Events adapter
    this.registerAdapter(ADAPTERS.EVENTS, {
      bind: (element: HTMLElement, event: string, handler: EventListener) => 
        this.adapter.bindEvent(element, event, handler),
      emit: <T>(subject: Subject<T>, value: T) => {
        this.ngZone.run(() => subject.next(value));
      },
      // Create custom event emitter
      createEmitter: <T>() => new Subject<T>()
    });

    // Angular-specific dependency injection adapter
    this.registerAdapter('injection', {
      get: <T>(token: any): T => this.injector.get(token),
      has: (token: any): boolean => {
        try {
          this.injector.get(token);
          return true;
        } catch {
          return false;
        }
      },
      create: <T>(token: any, options?: any): T => {
        // Use injector to create instance
        return this.injector.get(token, options);
      }
    });

    // RxJS operators adapter
    this.registerAdapter('rxjs', {
      operators: {
        map,
        distinctUntilChanged,
        shareReplay,
        // Add more operators as needed
      },
      // Helper to create pipeable operators
      pipe: (...operators: any[]) => (source: Observable<any>) => 
        source.pipe(...operators)
    });
  }

  // Angular-specific initialization
  init(core: any): void {
    // Store reference to ui-core instance
    this.core = core;
    
    // Set up Angular-specific components
    this.setupComponents();
    
    console.log('Angular plugin initialized with ui-core');
  }

  private setupComponents(): void {
    // Register Angular component references
    // These will be implemented as actual Angular components
    this.registerComponent(COMPONENTS.TOAST, 'FriggToastComponent');
    this.registerComponent(COMPONENTS.MODAL, 'FriggModalComponent');
    this.registerComponent(COMPONENTS.LOADING_SPINNER, 'FriggLoadingSpinnerComponent');
    this.registerComponent(COMPONENTS.BUTTON, 'FriggButtonComponent');
    this.registerComponent(COMPONENTS.INPUT, 'FriggInputComponent');
    this.registerComponent(COMPONENTS.TABLE, 'FriggTableComponent');
    this.registerComponent(COMPONENTS.FORM, 'FriggFormComponent');
  }

  // Angular-specific cleanup
  destroy(core: any): void {
    console.log('Angular plugin destroyed');
  }

  // Get Angular adapter
  getAngularAdapter(): AngularAdapter {
    if (!this.adapter) {
      this.initialize();
    }
    return this.adapter;
  }

  // Helper to create Observable from ui-core service
  createObservableFromService<T>(service: any, transformFn?: (state: any) => T): Observable<T> {
    const subject = new BehaviorSubject<T>(
      transformFn ? transformFn(service.getState()) : service.getState()
    );
    
    // Subscribe to service updates
    const unsubscribe = service.subscribe((state: any) => {
      this.ngZone.run(() => {
        subject.next(transformFn ? transformFn(state) : state);
      });
    });

    // Return observable with cleanup
    return new Observable(observer => {
      const subscription = subject.subscribe(observer);
      
      return () => {
        subscription.unsubscribe();
        unsubscribe();
      };
    });
  }
}

// Export factory function for Angular module
export function createAngularPlugin(injector: Injector, ngZone: NgZone): AngularPlugin {
  const plugin = new AngularPlugin(injector, ngZone);
  plugin.initialize();
  return plugin;
}