/**
 * Unit tests for Toast Service
 */

import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { ToastService, Toast } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let ngZone: NgZone;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    
    service = TestBed.inject(ToastService);
    ngZone = TestBed.inject(NgZone);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('show', () => {
    it('should show a toast with default variant', () => {
      const toast = service.show({ title: 'Test Toast' });
      
      expect(toast.id).toBeTruthy();
      expect(toast.title).toBe('Test Toast');
      expect(toast.variant).toBe('default');
    });

    it('should show a toast with custom duration', () => {
      const toast = service.show({ 
        title: 'Test Toast',
        duration: 3000
      });
      
      expect(toast.duration).toBe(3000);
    });
  });

  describe('success', () => {
    it('should show a success toast', () => {
      const toast = service.success('Success', 'Operation completed');
      
      expect(toast.variant).toBe('success');
      expect(toast.title).toBe('Success');
      expect(toast.description).toBe('Operation completed');
    });
  });

  describe('error', () => {
    it('should show an error toast with longer duration', () => {
      const toast = service.error('Error', 'Something went wrong');
      
      expect(toast.variant).toBe('error');
      expect(toast.duration).toBe(7000);
    });
  });

  describe('warning', () => {
    it('should show a warning toast', () => {
      const toast = service.warning('Warning', 'Please be careful');
      
      expect(toast.variant).toBe('warning');
    });
  });

  describe('info', () => {
    it('should show an info toast', () => {
      const toast = service.info('Info', 'For your information');
      
      expect(toast.variant).toBe('info');
    });
  });

  describe('promise', () => {
    it('should handle successful promise', async () => {
      const promise = Promise.resolve('Success data');
      const messages = {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed!'
      };

      const result = await service.promise(promise, messages);
      
      expect(result).toBe('Success data');
    });

    it('should handle failed promise', async () => {
      const promise = Promise.reject(new Error('Test error'));
      const messages = {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed!'
      };

      try {
        await service.promise(promise, messages);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Test error');
      }
    });

    it('should use function messages', async () => {
      const promise = Promise.resolve({ id: 123 });
      const messages = {
        loading: 'Loading...',
        success: (data: any) => `Created item ${data.id}`,
        error: (err: any) => `Error: ${err.message}`
      };

      await service.promise(promise, messages);
      
      // Verify the success message function was called
      const state = service.getState();
      const lastToast = state.toasts[state.toasts.length - 1];
      expect(lastToast.title).toBe('Created item 123');
    });
  });

  describe('dismiss', () => {
    it('should dismiss a specific toast', () => {
      const toast = service.show({ title: 'Test' });
      const initialCount = service.getState().toasts.length;
      
      service.dismiss(toast.id);
      
      // The toast should be marked for dismissal
      const updatedToast = service.getToast(toast.id);
      expect(updatedToast?.open).toBeFalsy();
    });
  });

  describe('dismissAll', () => {
    it('should dismiss all toasts', () => {
      service.show({ title: 'Toast 1' });
      service.show({ title: 'Toast 2' });
      service.show({ title: 'Toast 3' });
      
      service.dismissAll();
      
      const state = service.getState();
      const openToasts = state.toasts.filter(t => t.open !== false);
      expect(openToasts.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all toasts immediately', () => {
      service.show({ title: 'Toast 1' });
      service.show({ title: 'Toast 2' });
      
      service.clear();
      
      const state = service.getState();
      expect(state.toasts.length).toBe(0);
    });
  });

  describe('observables', () => {
    it('should emit toasts through toasts$ observable', (done) => {
      service.toasts$.subscribe(toasts => {
        if (toasts.length > 0) {
          expect(toasts[0].title).toBe('Observable Test');
          done();
        }
      });

      service.show({ title: 'Observable Test' });
    });

    it('should emit active toast count', (done) => {
      let emissionCount = 0;
      
      service.activeToastCount$.subscribe(count => {
        emissionCount++;
        
        if (emissionCount === 2) {
          expect(count).toBe(1);
          done();
        }
      });

      service.show({ title: 'Test' });
    });

    it('should emit toast added events', (done) => {
      service.toastAdded$.subscribe(toast => {
        expect(toast.title).toBe('New Toast');
        done();
      });

      service.show({ title: 'New Toast' });
    });
  });

  describe('getters', () => {
    it('should get toast by ID', () => {
      const toast = service.show({ title: 'Find Me' });
      
      const foundToast = service.getToast(toast.id);
      expect(foundToast?.title).toBe('Find Me');
    });

    it('should return undefined for non-existent toast', () => {
      const foundToast = service.getToast('non-existent-id');
      expect(foundToast).toBeUndefined();
    });

    it('should check if has active toasts', () => {
      expect(service.hasActiveToasts()).toBeFalsy();
      
      service.show({ title: 'Active' });
      expect(service.hasActiveToasts()).toBeTruthy();
    });
  });
});