/**
 * Angular Loading Spinner Component
 * Displays a customizable loading spinner
 */

import { 
  Component, 
  Input,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'frigg-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="frigg-loading-spinner"
      [class.frigg-loading-spinner--small]="size === 'small'"
      [class.frigg-loading-spinner--large]="size === 'large'"
      [class.frigg-loading-spinner--inline]="inline"
      [class.frigg-loading-spinner--overlay]="overlay"
    >
      <div class="frigg-loading-spinner__container" *ngIf="!overlay">
        <svg 
          class="frigg-loading-spinner__svg" 
          viewBox="0 0 24 24" 
          fill="none"
          [attr.aria-label]="label"
        >
          <circle 
            class="frigg-loading-spinner__circle-bg"
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            stroke-width="2"
          />
          <path 
            class="frigg-loading-spinner__circle"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"
            stroke="currentColor" 
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <span class="frigg-loading-spinner__text" *ngIf="text">{{ text }}</span>
      </div>
      
      <div class="frigg-loading-spinner__overlay" *ngIf="overlay">
        <div class="frigg-loading-spinner__overlay-content">
          <svg 
            class="frigg-loading-spinner__svg" 
            viewBox="0 0 24 24" 
            fill="none"
            [attr.aria-label]="label"
          >
            <circle 
              class="frigg-loading-spinner__circle-bg"
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              stroke-width="2"
            />
            <path 
              class="frigg-loading-spinner__circle"
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"
              stroke="currentColor" 
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span class="frigg-loading-spinner__text" *ngIf="text">{{ text }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .frigg-loading-spinner {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .frigg-loading-spinner__container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .frigg-loading-spinner__svg {
      width: 32px;
      height: 32px;
      animation: spin 1s linear infinite;
      color: #3B82F6;
    }

    .frigg-loading-spinner--small .frigg-loading-spinner__svg {
      width: 20px;
      height: 20px;
    }

    .frigg-loading-spinner--large .frigg-loading-spinner__svg {
      width: 48px;
      height: 48px;
    }

    .frigg-loading-spinner__circle-bg {
      opacity: 0.2;
    }

    .frigg-loading-spinner__circle {
      opacity: 1;
    }

    .frigg-loading-spinner__text {
      font-size: 14px;
      color: #6B7280;
      text-align: center;
    }

    .frigg-loading-spinner--inline {
      display: inline-flex;
    }

    .frigg-loading-spinner--inline .frigg-loading-spinner__container {
      flex-direction: row;
    }

    /* Overlay styles */
    .frigg-loading-spinner--overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9998;
    }

    .frigg-loading-spinner__overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(4px);
    }

    .frigg-loading-spinner__overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .frigg-loading-spinner__svg {
        color: #60A5FA;
      }

      .frigg-loading-spinner__text {
        color: #D1D5DB;
      }

      .frigg-loading-spinner__overlay {
        background: rgba(17, 24, 39, 0.95);
      }
    }

    /* Animation */
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggLoadingSpinnerComponent {
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() text?: string;
  @Input() inline: boolean = false;
  @Input() overlay: boolean = false;
  @Input() label: string = 'Loading';
}