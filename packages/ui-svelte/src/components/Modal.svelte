<script>
  import { fade, scale } from 'svelte/transition';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  // Props
  export let open = false;
  export let title = '';
  export let description = '';
  export let size = 'md';
  export let closeOnEscape = true;
  export let closeOnOutsideClick = true;
  export let showCloseButton = true;
  export let className = '';

  const dispatch = createEventDispatcher();

  // Size mappings
  $: sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full mx-4'
  }[size] || 'max-w-md';

  // Handle close
  function handleClose() {
    open = false;
    dispatch('close');
  }

  // Handle backdrop click
  function handleBackdropClick(event) {
    if (closeOnOutsideClick && event.target === event.currentTarget) {
      handleClose();
    }
  }

  // Handle escape key
  function handleKeydown(event) {
    if (closeOnEscape && event.key === 'Escape' && open) {
      handleClose();
    }
  }

  // Lock body scroll when modal is open
  $: if (typeof document !== 'undefined') {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  // Focus management
  let modalElement;
  let previousActiveElement;

  onMount(() => {
    if (open) {
      previousActiveElement = document.activeElement;
      modalElement?.focus();
    }
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });

  // Restore focus on close
  $: if (!open && previousActiveElement) {
    previousActiveElement.focus();
    previousActiveElement = null;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    class="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    transition:fade={{ duration: 200 }}
    on:click={handleBackdropClick}
    on:keydown={handleKeydown}
    role="presentation"
  >
    <div
      bind:this={modalElement}
      class="modal-content bg-white rounded-lg shadow-xl w-full {sizeClasses} {className}"
      transition:scale={{ duration: 200, start: 0.95 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      tabindex="-1"
    >
      <!-- Header -->
      {#if title || showCloseButton}
        <div class="modal-header flex items-center justify-between p-6 border-b">
          {#if title}
            <h2 id="modal-title" class="text-xl font-semibold text-gray-900">
              {title}
            </h2>
          {/if}
          {#if showCloseButton}
            <button
              on:click={handleClose}
              class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
              aria-label="Close modal"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Description -->
      {#if description}
        <div class="modal-description px-6 pt-4">
          <p id="modal-description" class="text-gray-600">
            {description}
          </p>
        </div>
      {/if}

      <!-- Body -->
      <div class="modal-body p-6">
        <slot />
      </div>

      <!-- Footer -->
      {#if $$slots.footer}
        <div class="modal-footer px-6 pb-6 pt-0">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    backdrop-filter: blur(2px);
  }

  .modal-content {
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  /* Smooth scrolling for modal content */
  .modal-content {
    scroll-behavior: smooth;
  }

  /* Custom scrollbar for modal */
  .modal-content::-webkit-scrollbar {
    width: 8px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .modal-content::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  .modal-content::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style>