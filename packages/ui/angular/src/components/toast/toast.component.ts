/**
 * Angular Toast Component
 * Displays toast notifications with animations and auto-dismiss
 */

import { 
  Component, 
  Input, 
  Output, 
  EventEmitter, 
  OnInit, 
  OnDestroy,
  ChangeDetectionStrategy
} from '@angular/core';
import { 
  trigger, 
  state, 
  style, 
  transition, 
  animate 
} from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'frigg-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="frigg-toast"
      [class.frigg-toast--success]="variant === 'success'"
      [class.frigg-toast--error]="variant === 'error'"
      [class.frigg-toast--warning]="variant === 'warning'"
      [class.frigg-toast--info]="variant === 'info'"
      [@slideIn]="animationState"
      (click)="handleClick()"
    >
      <div class="frigg-toast__icon">
        <svg *ngIf="variant === 'success'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <svg *ngIf="variant === 'error'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <svg *ngIf="variant === 'warning'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <svg *ngIf="variant === 'info'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
        <svg *ngIf="!variant || variant === 'default'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
      </div>
      
      <div class="frigg-toast__content">
        <div class="frigg-toast__title" *ngIf="title">{{ title }}</div>
        <div class="frigg-toast__description" *ngIf="description">{{ description }}</div>
      </div>
      
      <div class="frigg-toast__actions">
        <button 
          *ngIf="action" 
          class="frigg-toast__action"
          (click)="handleAction($event)"
        >
          {{ action.label }}
        </button>
        <button 
          class="frigg-toast__close"
          (click)="handleClose($event)"
          aria-label="Close"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .frigg-toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 300px;
      max-width: 500px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-toast:hover {
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    .frigg-toast__icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      color: #6B7280;
    }

    .frigg-toast--success .frigg-toast__icon {
      color: #10B981;
    }

    .frigg-toast--error .frigg-toast__icon {
      color: #EF4444;
    }

    .frigg-toast--warning .frigg-toast__icon {
      color: #F59E0B;
    }

    .frigg-toast--info .frigg-toast__icon {
      color: #3B82F6;
    }

    .frigg-toast__content {
      flex: 1;
      min-width: 0;
    }

    .frigg-toast__title {
      font-weight: 600;
      font-size: 14px;
      line-height: 20px;
      color: #111827;
    }

    .frigg-toast__description {
      margin-top: 4px;
      font-size: 14px;
      line-height: 20px;
      color: #6B7280;
    }

    .frigg-toast__actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .frigg-toast__action {
      padding: 4px 8px;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-toast__action:hover {
      background: #F3F4F6;
      border-color: #D1D5DB;
    }

    .frigg-toast__close {
      padding: 4px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-toast__close:hover {
      background: #F3F4F6;
      color: #374151;
    }

    .frigg-toast__close svg {
      width: 16px;
      height: 16px;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .frigg-toast {
        background: #1F2937;
        color: white;
      }

      .frigg-toast__title {
        color: white;
      }

      .frigg-toast__description {
        color: #D1D5DB;
      }

      .frigg-toast__action {
        border-color: #374151;
        color: #D1D5DB;
      }

      .frigg-toast__action:hover {
        background: #374151;
        border-color: #4B5563;
        color: white;
      }

      .frigg-toast__close {
        color: #9CA3AF;
      }

      .frigg-toast__close:hover {
        background: #374151;
        color: white;
      }
    }
  `],
  animations: [
    trigger('slideIn', [
      state('void', style({
        transform: 'translateX(100%)',
        opacity: 0
      })),
      state('visible', style({
        transform: 'translateX(0)',
        opacity: 1
      })),
      state('hidden', style({
        transform: 'translateX(100%)',
        opacity: 0
      })),
      transition('void => visible', [
        animate('300ms ease-out')
      ]),
      transition('visible => hidden', [
        animate('200ms ease-in')
      ])
    ])
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggToastComponent implements OnInit, OnDestroy {
  @Input() id!: string;
  @Input() title?: string;
  @Input() description?: string;
  @Input() variant: 'default' | 'success' | 'error' | 'warning' | 'info' = 'default';
  @Input() duration: number = 5000;
  @Input() action?: { label: string; onClick: () => void };
  
  @Output() dismiss = new EventEmitter<void>();
  @Output() click = new EventEmitter<void>();
  
  animationState: 'visible' | 'hidden' = 'visible';
  
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Auto-dismiss after duration
    if (this.duration > 0) {
      timer(this.duration)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          this.close();
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  handleClick(): void {
    this.click.emit();
  }

  handleAction(event: Event): void {
    event.stopPropagation();
    if (this.action) {
      this.action.onClick();
    }
  }

  handleClose(event: Event): void {
    event.stopPropagation();
    this.close();
  }

  close(): void {
    this.animationState = 'hidden';
    setTimeout(() => {
      this.dismiss.emit();
    }, 200);
  }
}