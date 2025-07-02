/**
 * Angular Toast Container Component
 * Manages and displays multiple toast notifications
 */

import { 
  Component, 
  OnInit, 
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FriggToastComponent } from './toast.component';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'frigg-toast-container',
  standalone: true,
  imports: [CommonModule, FriggToastComponent],
  template: `
    <div class="frigg-toast-container" [class.frigg-toast-container--empty]="toasts.length === 0">
      <frigg-toast
        *ngFor="let toast of toasts; trackBy: trackByToastId"
        [id]="toast.id"
        [title]="toast.title"
        [description]="toast.description"
        [variant]="toast.variant || 'default'"
        [duration]="toast.duration || 5000"
        [action]="toast.action"
        (dismiss)="handleDismiss(toast.id)"
        (click)="handleClick(toast)"
      ></frigg-toast>
    </div>
  `,
  styles: [`
    .frigg-toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }

    .frigg-toast-container--empty {
      display: none;
    }

    .frigg-toast-container frigg-toast {
      pointer-events: auto;
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
      .frigg-toast-container {
        top: 10px;
        right: 10px;
        left: 10px;
      }
    }

    /* Animation for new toasts */
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    frigg-toast {
      animation: slideInRight 0.3s ease-out;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggToastContainerComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  
  private destroy$ = new Subject<void>();

  constructor(
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to toast changes
    this.toastService.toasts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(toasts => {
        this.toasts = toasts.filter(t => t.open !== false);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByToastId(index: number, toast: Toast): string {
    return toast.id;
  }

  handleDismiss(toastId: string): void {
    this.toastService.dismiss(toastId);
  }

  handleClick(toast: Toast): void {
    // Optional: Handle toast click
    console.log('Toast clicked:', toast);
  }
}