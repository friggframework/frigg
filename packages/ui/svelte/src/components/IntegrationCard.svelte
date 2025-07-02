<script>
  import { createEventDispatcher } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  // Props
  export let integration = {};
  export let variant = 'default'; // default, compact, detailed
  export let showActions = true;
  export let loading = false;
  export let disabled = false;
  export let className = '';

  const dispatch = createEventDispatcher();

  // Computed properties
  $: isConnected = integration?.status === 'connected' || integration?.isConnected;
  $: statusColor = isConnected ? 'text-green-600' : 'text-gray-400';
  $: statusText = isConnected ? 'Connected' : 'Not Connected';
  $: statusIcon = isConnected ? '✓' : '○';

  // Handle actions
  function handleConnect() {
    dispatch('connect', { integration });
  }

  function handleDisconnect() {
    dispatch('disconnect', { integration });
  }

  function handleConfigure() {
    dispatch('configure', { integration });
  }

  function handleView() {
    dispatch('view', { integration });
  }

  function handleClick() {
    if (!disabled) {
      dispatch('click', { integration });
    }
  }
</script>

<div
  class="integration-card bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow
         {disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
         {variant === 'compact' ? 'p-4' : 'p-6'}
         {className}"
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-disabled={disabled}
>
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <LoadingSpinner size="lg" />
    </div>
  {:else}
    <div class="flex items-start gap-4">
      <!-- Icon/Logo -->
      {#if integration.icon || integration.logo}
        <div class="flex-shrink-0">
          {#if integration.icon}
            <div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
              {integration.icon}
            </div>
          {:else}
            <img
              src={integration.logo}
              alt="{integration.name} logo"
              class="w-12 h-12 rounded-lg object-cover"
            />
          {/if}
        </div>
      {/if}

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 truncate">
              {integration.name || 'Unknown Integration'}
            </h3>
            {#if integration.category}
              <p class="text-xs text-gray-500 mt-1">{integration.category}</p>
            {/if}
          </div>

          <!-- Status indicator -->
          <div class="flex items-center gap-1 {statusColor} text-sm font-medium">
            <span class="text-lg">{statusIcon}</span>
            <span>{statusText}</span>
          </div>
        </div>

        <!-- Description -->
        {#if integration.description && variant !== 'compact'}
          <p class="mt-2 text-sm text-gray-600 line-clamp-2">
            {integration.description}
          </p>
        {/if}

        <!-- Metadata -->
        {#if variant === 'detailed' && (integration.lastSync || integration.dataPoints)}
          <div class="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
            {#if integration.lastSync}
              <div>
                Last sync: <span class="font-medium">{new Date(integration.lastSync).toLocaleDateString()}</span>
              </div>
            {/if}
            {#if integration.dataPoints}
              <div>
                Data points: <span class="font-medium">{integration.dataPoints.toLocaleString()}</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Actions -->
        {#if showActions && !disabled}
          <div class="mt-4 flex flex-wrap gap-2" on:click|stopPropagation on:keydown|stopPropagation role="group">
            {#if isConnected}
              <button
                on:click={handleConfigure}
                class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Configure
              </button>
              <button
                on:click={handleDisconnect}
                class="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Disconnect
              </button>
            {:else}
              <button
                on:click={handleConnect}
                class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Connect
              </button>
            {/if}
            <button
              on:click={handleView}
              class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              View Details
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>