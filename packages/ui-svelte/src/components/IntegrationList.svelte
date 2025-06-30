<script>
  import { createEventDispatcher } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import IntegrationCard from './IntegrationCard.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  // Props
  export let integrations = [];
  export let loading = false;
  export let error = null;
  export let variant = 'grid'; // grid, list, compact
  export let columns = 3;
  export let showFilters = true;
  export let showSearch = true;
  export let emptyMessage = 'No integrations found';
  export let className = '';

  const dispatch = createEventDispatcher();

  // Local state
  let searchQuery = '';
  let selectedCategory = 'all';
  let selectedStatus = 'all';
  let sortBy = 'name';

  // Get unique categories
  $: categories = ['all', ...new Set(integrations.map(i => i.category).filter(Boolean))];

  // Filter and sort integrations
  $: filteredIntegrations = integrations
    .filter(integration => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = integration.name?.toLowerCase().includes(query);
        const matchesDescription = integration.description?.toLowerCase().includes(query);
        const matchesCategory = integration.category?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription && !matchesCategory) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all' && integration.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all') {
        const isConnected = integration.status === 'connected' || integration.isConnected;
        if (selectedStatus === 'connected' && !isConnected) return false;
        if (selectedStatus === 'disconnected' && isConnected) return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        case 'status':
          const aConnected = a.status === 'connected' || a.isConnected;
          const bConnected = b.status === 'connected' || b.isConnected;
          return bConnected - aConnected;
        default:
          return 0;
      }
    });

  // Grid layout classes
  $: gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  }[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  // Handle card events
  function handleCardEvent(eventName, event) {
    dispatch(eventName, event.detail);
  }
</script>

<div class="integration-list {className}">
  <!-- Filters and Search -->
  {#if showFilters || showSearch}
    <div class="mb-6 space-y-4">
      {#if showSearch}
        <div class="relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search integrations..."
            class="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      {/if}

      {#if showFilters}
        <div class="flex flex-wrap gap-3">
          <!-- Category filter -->
          <select
            bind:value={selectedCategory}
            class="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {#each categories as category}
              <option value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            {/each}
          </select>

          <!-- Status filter -->
          <select
            bind:value={selectedStatus}
            class="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="connected">Connected</option>
            <option value="disconnected">Not Connected</option>
          </select>

          <!-- Sort -->
          <select
            bind:value={sortBy}
            class="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name">Sort by Name</option>
            <option value="category">Sort by Category</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Results count -->
  {#if !loading && !error}
    <div class="mb-4 text-sm text-gray-600">
      Showing {filteredIntegrations.length} of {integrations.length} integrations
    </div>
  {/if}

  <!-- Loading state -->
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" message="Loading integrations..." />
    </div>

  <!-- Error state -->
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <svg class="w-12 h-12 text-red-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="text-lg font-semibold text-red-900 mb-1">Error loading integrations</h3>
      <p class="text-red-700">{error.message || 'An unexpected error occurred'}</p>
    </div>

  <!-- Empty state -->
  {:else if filteredIntegrations.length === 0}
    <div class="text-center py-12">
      <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="text-gray-600">{emptyMessage}</p>
      {#if searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'}
        <button
          on:click={() => {
            searchQuery = '';
            selectedCategory = 'all';
            selectedStatus = 'all';
          }}
          class="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          Clear filters
        </button>
      {/if}
    </div>

  <!-- Integration grid/list -->
  {:else}
    <div class={variant === 'grid' ? `grid ${gridClasses} gap-4` : 'space-y-4'}>
      {#each filteredIntegrations as integration (integration.id || integration.name)}
        <div
          animate:flip={{ duration: 200 }}
          transition:fade={{ duration: 150 }}
        >
          <IntegrationCard
            {integration}
            variant={variant === 'compact' ? 'compact' : 'default'}
            on:connect={(e) => handleCardEvent('connect', e)}
            on:disconnect={(e) => handleCardEvent('disconnect', e)}
            on:configure={(e) => handleCardEvent('configure', e)}
            on:view={(e) => handleCardEvent('view', e)}
            on:click={(e) => handleCardEvent('select', e)}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>