<script>
  import { onMount, createEventDispatcher } from 'svelte';
  
  // Props
  export let fallback = null;
  export let onError = null;
  export let resetKeys = [];
  export let resetOnPropsChange = true;
  export let isolate = true;
  
  const dispatch = createEventDispatcher();
  
  // Error state
  let error = null;
  let errorInfo = null;
  let hasError = false;
  
  // Reset error state
  export function resetError() {
    error = null;
    errorInfo = null;
    hasError = false;
  }
  
  // Handle errors
  function handleError(err, info = {}) {
    error = err;
    errorInfo = info;
    hasError = true;
    
    // Call custom error handler
    if (onError) {
      onError(err, info);
    }
    
    // Dispatch error event
    dispatch('error', { error: err, errorInfo: info });
    
    console.error('Error caught by ErrorBoundary:', err);
  }
  
  // Set up error handling
  onMount(() => {
    if (isolate) {
      // In Svelte, we can't catch errors from child components directly
      // But we can listen for unhandled errors
      const handleUnhandledError = (event) => {
        handleError(event.error, {
          componentStack: 'Error caught at boundary',
          errorBoundary: true
        });
        event.preventDefault();
      };
      
      const handleUnhandledRejection = (event) => {
        handleError(event.reason, {
          componentStack: 'Unhandled promise rejection',
          errorBoundary: true
        });
        event.preventDefault();
      };
      
      window.addEventListener('error', handleUnhandledError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
      
      return () => {
        window.removeEventListener('error', handleUnhandledError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }
  });
  
  // Reset on prop changes
  $: if (resetOnPropsChange && resetKeys.length > 0) {
    resetError();
  }
  
  // Default error UI
  function DefaultErrorFallback({ error, resetError }) {
    return {
      error,
      resetError
    };
  }
</script>

{#if hasError}
  {#if fallback}
    <!-- Custom fallback component -->
    <svelte:component this={fallback} {error} {errorInfo} {resetError} />
  {:else}
    <!-- Default error UI -->
    <div class="error-boundary-default p-6 my-4 bg-red-50 border border-red-200 rounded-lg">
      <div class="flex items-start gap-3">
        <svg class="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-red-900">Something went wrong</h3>
          
          <p class="mt-2 text-sm text-red-700">
            An error occurred while rendering this component.
          </p>
          
          {#if error?.message}
            <div class="mt-3 p-3 bg-red-100 rounded text-xs">
              <p class="font-mono text-red-800">{error.message}</p>
            </div>
          {/if}
          
          <div class="mt-4 flex gap-3">
            <button
              on:click={resetError}
              class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-medium"
            >
              Try Again
            </button>
            
            <button
              on:click={() => window.location.reload()}
              class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm font-medium"
            >
              Reload Page
            </button>
          </div>
          
          {#if errorInfo || (error && error.stack)}
            <details class="mt-4">
              <summary class="cursor-pointer text-sm text-red-700 hover:text-red-800">
                Show error details
              </summary>
              <pre class="mt-2 p-3 bg-red-100 rounded text-xs overflow-x-auto">
{error?.stack || JSON.stringify({ error: error?.toString(), ...errorInfo }, null, 2)}
              </pre>
            </details>
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:else}
  <!-- Normal content -->
  <slot />
{/if}

<style>
  .error-boundary-default {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }
  
  pre {
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>