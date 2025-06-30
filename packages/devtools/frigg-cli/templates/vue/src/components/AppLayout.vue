<script setup>
import { ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const route = useRoute();

const navigation = [
  { name: 'Dashboard', to: '/' },
  { name: 'Integrations', to: '/integrations' },
  { name: 'Settings', to: '/settings' }
];

const isActive = (path) => {
  return route.path === path;
};
</script>

<template>
  <div class="min-h-screen bg-background">
    <nav class="border-b">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <img
                class="h-8 w-auto"
                src="/frigg-logo.svg"
                alt="Frigg"
              />
            </div>
            <div class="ml-10 flex items-baseline space-x-4">
              <RouterLink
                v-for="item in navigation"
                :key="item.name"
                :to="item.to"
                :class="[
                  isActive(item.to)
                    ? 'bg-muted text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors'
                ]"
              >
                {{ item.name }}
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <slot />
    </main>
  </div>
</template>