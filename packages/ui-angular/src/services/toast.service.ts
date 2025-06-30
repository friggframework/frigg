/**
 * Angular Toast Service
 * Wraps ui-core ToastManager with RxJS observables for Angular integration
 */

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { ToastManager } from '@friggframework/ui-core/state';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastState {
  toasts: Toast[];
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastManager: ToastManager;
  private stateSubject: BehaviorSubject<ToastState>;
  private toastAddedSubject: Subject<Toast>;
  private toastRemovedSubject: Subject<string>;
  private unsubscribe?: () => void;

  // Observable streams
  public state$: Observable<ToastState>;
  public toasts$: Observable<Toast[]>;
  public toastAdded$: Observable<Toast>;
  public toastRemoved$: Observable<string>;
  public activeToastCount$: Observable<number>;

  constructor(private ngZone: NgZone) {
    // Initialize toast manager
    this.toastManager = new ToastManager();
    
    // Initialize subjects
    this.stateSubject = new BehaviorSubject<ToastState>(this.toastManager.getState());
    this.toastAddedSubject = new Subject<Toast>();
    this.toastRemovedSubject = new Subject<string>();

    // Set up observables
    this.state$ = this.stateSubject.asObservable();
    this.toasts$ = this.state$.pipe(
      map(state => state.toasts),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
    );
    this.toastAdded$ = this.toastAddedSubject.asObservable();
    this.toastRemoved$ = this.toastRemovedSubject.asObservable();
    this.activeToastCount$ = this.toasts$.pipe(
      map(toasts => toasts.filter(t => t.open).length),
      distinctUntilChanged()
    );

    // Subscribe to toast manager updates
    this.setupSubscription();
  }

  private setupSubscription(): void {
    // Track previous state for comparison
    let previousToasts = this.toastManager.getState().toasts;

    this.unsubscribe = this.toastManager.subscribe((state: ToastState) => {
      this.ngZone.run(() => {
        // Detect added toasts
        const currentToasts = state.toasts;
        const addedToasts = currentToasts.filter(
          current => !previousToasts.find(prev => prev.id === current.id)
        );
        
        // Detect removed toasts
        const removedToasts = previousToasts.filter(
          prev => !currentToasts.find(current => current.id === prev.id)
        );

        // Emit events
        addedToasts.forEach(toast => this.toastAddedSubject.next(toast));
        removedToasts.forEach(toast => this.toastRemovedSubject.next(toast.id));

        // Update state
        this.stateSubject.next(state);
        previousToasts = currentToasts;
      });
    });
  }

  /**
   * Show a toast notification
   */
  show(options: Omit<Toast, 'id'>): Toast {
    const toastResult = this.toastManager.toast({
      ...options,
      variant: options.variant || 'default',
      duration: options.duration || 5000
    });

    return {
      ...options,
      id: toastResult.id,
      dismiss: () => this.dismiss(toastResult.id),
      update: (props: Partial<Toast>) => this.update(toastResult.id, props)
    } as Toast;
  }

  /**
   * Show success toast
   */
  success(title: string, description?: string, options?: Partial<Toast>): Toast {
    return this.show({
      ...options,
      title,
      description,
      variant: 'success'
    });
  }

  /**
   * Show error toast
   */
  error(title: string, description?: string, options?: Partial<Toast>): Toast {
    return this.show({
      ...options,
      title,
      description,
      variant: 'error',
      duration: options?.duration || 7000 // Errors stay longer
    });
  }

  /**
   * Show warning toast
   */
  warning(title: string, description?: string, options?: Partial<Toast>): Toast {
    return this.show({
      ...options,
      title,
      description,
      variant: 'warning'
    });
  }

  /**
   * Show info toast
   */
  info(title: string, description?: string, options?: Partial<Toast>): Toast {
    return this.show({
      ...options,
      title,
      description,
      variant: 'info'
    });
  }

  /**
   * Show loading toast with promise
   */
  async promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ): Promise<T> {
    const toast = this.show({
      title: messages.loading,
      variant: 'default'
    });

    try {
      const result = await promise;
      this.update(toast.id, {
        title: typeof messages.success === 'function' 
          ? messages.success(result) 
          : messages.success,
        variant: 'success'
      });
      setTimeout(() => this.dismiss(toast.id), 3000);
      return result;
    } catch (error) {
      this.update(toast.id, {
        title: typeof messages.error === 'function' 
          ? messages.error(error) 
          : messages.error,
        variant: 'error'
      });
      setTimeout(() => this.dismiss(toast.id), 5000);
      throw error;
    }
  }

  /**
   * Update an existing toast
   */
  update(toastId: string, updates: Partial<Toast>): void {
    const currentState = this.toastManager.getState();
    const toast = currentState.toasts.find(t => t.id === toastId);
    
    if (toast) {
      // Use the toast manager's update function
      const toastRef = { id: toastId, update: (props: any) => {} };
      this.toastManager.toast({ ...toast, ...updates, id: toastId });
    }
  }

  /**
   * Dismiss a specific toast
   */
  dismiss(toastId: string): void {
    this.toastManager.dismiss(toastId);
  }

  /**
   * Dismiss all toasts
   */
  dismissAll(): void {
    this.toastManager.dismissAll();
  }

  /**
   * Clear all toasts immediately
   */
  clear(): void {
    this.toastManager.clear();
  }

  /**
   * Get current toast state
   */
  getState(): ToastState {
    return this.toastManager.getState();
  }

  /**
   * Get a specific toast by ID
   */
  getToast(toastId: string): Toast | undefined {
    return this.getState().toasts.find(t => t.id === toastId);
  }

  /**
   * Check if any toasts are active
   */
  hasActiveToasts(): boolean {
    return this.getState().toasts.some(t => t.open);
  }

  /**
   * Clean up subscriptions
   */
  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.toastAddedSubject.complete();
    this.toastRemovedSubject.complete();
    this.stateSubject.complete();
  }
}