import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-background">
      <nav class="border-b">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div class="flex h-16 items-center justify-between">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <img
                  class="h-8 w-auto"
                  src="/assets/frigg-logo.svg"
                  alt="Frigg"
                />
              </div>
              <div class="ml-10 flex items-baseline space-x-4">
                <a
                  *ngFor="let item of navigation"
                  [routerLink]="item.path"
                  routerLinkActive="bg-muted text-primary"
                  class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  [routerLinkActiveOptions]="{ exact: item.path === '/' }"
                >
                  {{ item.name }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ng-content />
      </main>
    </div>
  `,
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  navigation = [
    { name: 'Dashboard', path: '/' },
    { name: 'Integrations', path: '/integrations' },
    { name: 'Settings', path: '/settings' }
  ];
}