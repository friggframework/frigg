/**
 * Angular Modal Component
 * Displays content in a modal overlay with customizable options
 */

import { 
  Component, 
  Input, 
  Output, 
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  trigger, 
  state, 
  style, 
  transition, 
  animate 
} from '@angular/animations';

@Component({
  selector: 'frigg-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="frigg-modal"
      [class.frigg-modal--open]="isOpen"
      [@fadeIn]="isOpen ? 'visible' : 'hidden'"
      (click)="handleBackdropClick($event)"
    >
      <div 
        class="frigg-modal__backdrop"
        [@fadeIn]="isOpen ? 'visible' : 'hidden'"
      ></div>
      
      <div 
        class="frigg-modal__container"
        [class.frigg-modal__container--small]="size === 'small'"
        [class.frigg-modal__container--large]="size === 'large'"
        [class.frigg-modal__container--fullscreen]="size === 'fullscreen'"
        [@slideUp]="isOpen ? 'visible' : 'hidden'"
        #modalContent
      >
        <div class="frigg-modal__header" *ngIf="title || showCloseButton">
          <h2 class="frigg-modal__title" *ngIf="title">{{ title }}</h2>
          <button 
            *ngIf="showCloseButton"
            class="frigg-modal__close"
            (click)="handleClose()"
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="frigg-modal__body">
          <ng-content></ng-content>
        </div>
        
        <div class="frigg-modal__footer" *ngIf="showFooter">
          <ng-content select="[modal-footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .frigg-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .frigg-modal--open {
      display: flex;
    }

    .frigg-modal__backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
    }

    .frigg-modal__container {
      position: relative;
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
    }

    .frigg-modal__container--small {
      max-width: 400px;
    }

    .frigg-modal__container--large {
      max-width: 800px;
    }

    .frigg-modal__container--fullscreen {
      max-width: 100%;
      width: 100%;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }

    .frigg-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #E5E7EB;
    }

    .frigg-modal__title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .frigg-modal__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-modal__close:hover {
      background: #F3F4F6;
      color: #374151;
    }

    .frigg-modal__close svg {
      width: 20px;
      height: 20px;
    }

    .frigg-modal__body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    .frigg-modal__footer {
      padding: 16px 24px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
      .frigg-modal {
        padding: 0;
      }

      .frigg-modal__container {
        max-width: 100%;
        width: 100%;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .frigg-modal__backdrop {
        background: rgba(0, 0, 0, 0.8);
      }

      .frigg-modal__container {
        background: #1F2937;
      }

      .frigg-modal__header {
        border-bottom-color: #374151;
      }

      .frigg-modal__title {
        color: white;
      }

      .frigg-modal__close {
        color: #9CA3AF;
      }

      .frigg-modal__close:hover {
        background: #374151;
        color: white;
      }

      .frigg-modal__footer {
        border-top-color: #374151;
      }
    }
  `],
  animations: [
    trigger('fadeIn', [
      state('hidden', style({
        opacity: 0
      })),
      state('visible', style({
        opacity: 1
      })),
      transition('hidden => visible', [
        animate('200ms ease-out')
      ]),
      transition('visible => hidden', [
        animate('150ms ease-in')
      ])
    ]),
    trigger('slideUp', [
      state('hidden', style({
        transform: 'translateY(20px) scale(0.95)',
        opacity: 0
      })),
      state('visible', style({
        transform: 'translateY(0) scale(1)',
        opacity: 1
      })),
      transition('hidden => visible', [
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)')
      ]),
      transition('visible => hidden', [
        animate('200ms cubic-bezier(0.7, 0, 0.84, 0)')
      ])
    ])
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggModalComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() isOpen: boolean = false;
  @Input() title?: string;
  @Input() size: 'small' | 'medium' | 'large' | 'fullscreen' = 'medium';
  @Input() showCloseButton: boolean = true;
  @Input() showFooter: boolean = false;
  @Input() closeOnEscape: boolean = true;
  @Input() closeOnBackdrop: boolean = true;
  
  @Output() close = new EventEmitter<void>();
  
  @ViewChild('modalContent', { static: false }) modalContent?: ElementRef;

  ngOnInit(): void {
    if (this.closeOnEscape) {
      document.addEventListener('keydown', this.handleEscapeKey);
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.handleEscapeKey);
  }

  ngAfterViewInit(): void {
    // Focus trap management
    if (this.isOpen && this.modalContent) {
      this.trapFocus();
    }
  }

  handleBackdropClick(event: MouseEvent): void {
    if (this.closeOnBackdrop && event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  handleClose(): void {
    this.close.emit();
  }

  private handleEscapeKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen) {
      this.handleClose();
    }
  };

  private trapFocus(): void {
    // Simple focus trap implementation
    const focusableElements = this.modalContent?.nativeElement.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
    );
    
    const firstFocusable = focusableElements?.[0];
    const lastFocusable = focusableElements?.[focusableElements.length - 1];

    if (firstFocusable) {
      (firstFocusable as HTMLElement).focus();
    }

    // Tab cycling logic would go here
  }
}