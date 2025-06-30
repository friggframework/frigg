<script>
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { toastStore } from '../stores/toast.js';

  // Toast position configuration
  export let position = 'top-right';
  export let maxToasts = 5;

  // Get position classes
  $: positionClasses = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4'
  }[position] || 'top-4 right-4';

  // Get variant classes
  const variantClasses = {
    default: 'border-blue-500 bg-blue-50 text-blue-900',
    success: 'border-green-500 bg-green-50 text-green-900',
    destructive: 'border-red-500 bg-red-50 text-red-900',
    warning: 'border-yellow-500 bg-yellow-50 text-yellow-900'
  };

  // Get icon for variant
  const variantIcons = {
    default: '📋',
    success: '✅',
    destructive: '❌',
    warning: '⚠️'
  };

  // Limit displayed toasts
  $: displayedToasts = $toastStore.slice(0, maxToasts);

  // Handle dismiss
  function handleDismiss(id) {
    toastStore.dismiss(id);
  }
</script>

<div class="toast-container fixed z-50 pointer-events-none {positionClasses}">
  {#each displayedToasts as toast (toast.id)}
    <div
      animate:flip={{ duration: 200 }}
      in:fly={{ y: position.includes('top') ? -20 : 20, duration: 300 }}
      out:fade={{ duration: 200 }}
      class="toast pointer-events-auto mb-2 flex items-start gap-3 rounded-lg border-l-4 p-4 shadow-lg transition-all
             {variantClasses[toast.variant] || variantClasses.default}"
      role="alert"
      aria-live="polite"
    >
      <!-- Icon -->
      <span class="text-xl" aria-hidden="true">
        {variantIcons[toast.variant] || variantIcons.default}
      </span>

      <!-- Content -->
      <div class="flex-1">
        {#if toast.title}
          <h4 class="font-semibold text-sm">{toast.title}</h4>
        {/if}
        {#if toast.description}
          <p class="text-sm mt-1 opacity-90">{toast.description}</p>
        {/if}
      </div>

      <!-- Action button if provided -->
      {#if toast.action}
        <button
          on:click={toast.action.onClick}
          class="text-sm font-medium underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-offset-2 rounded"
        >
          {toast.action.label}
        </button>
      {/if}

      <!-- Close button -->
      <button
        on:click={() => handleDismiss(toast.id)}
        class="text-lg opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 rounded"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    max-width: 420px;
    width: 100%;
  }

  .toast {
    max-width: 100%;
    background-color: white;
    word-break: break-word;
  }

  @media (max-width: 640px) {
    .toast-container {
      max-width: calc(100vw - 2rem);
    }
  }
</style>