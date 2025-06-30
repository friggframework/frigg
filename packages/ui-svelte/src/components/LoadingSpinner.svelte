<script>
  import { fade } from 'svelte/transition';

  // Props
  export let size = 'md';
  export let color = 'primary';
  export let overlay = false;
  export let message = '';
  export let className = '';

  // Size mappings
  $: sizeClasses = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-2',
    xl: 'w-16 h-16 border-4'
  }[size] || 'w-8 h-8 border-2';

  // Color mappings
  $: colorClasses = {
    primary: 'border-blue-600 border-t-transparent',
    secondary: 'border-gray-600 border-t-transparent',
    success: 'border-green-600 border-t-transparent',
    danger: 'border-red-600 border-t-transparent',
    warning: 'border-yellow-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    current: 'border-current border-t-transparent'
  }[color] || 'border-blue-600 border-t-transparent';
</script>

{#if overlay}
  <div 
    class="loading-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    transition:fade={{ duration: 200 }}
  >
    <div class="loading-content bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4">
      <div 
        class="spinner animate-spin rounded-full {sizeClasses} {colorClasses} {className}"
        role="status"
        aria-label="Loading"
      />
      {#if message}
        <p class="text-gray-700 text-sm font-medium">{message}</p>
      {/if}
    </div>
  </div>
{:else}
  <div class="inline-flex items-center gap-3">
    <div 
      class="spinner animate-spin rounded-full {sizeClasses} {colorClasses} {className}"
      role="status"
      aria-label="Loading"
    />
    {#if message}
      <span class="text-gray-700 text-sm">{message}</span>
    {/if}
  </div>
{/if}

<style>
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  .loading-overlay {
    backdrop-filter: blur(2px);
  }
</style>