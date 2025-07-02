<script>
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { alertsStore, alertCounts } from '../stores/alerts.js';
  import LoadingSpinner from './LoadingSpinner.svelte';

  // Props
  export let maxHeight = '400px';
  export let showHeader = true;
  export let showFilters = true;
  export let autoRefresh = true;
  export let refreshInterval = 30000; // 30 seconds
  export let className = '';

  // Local state
  let loading = false;
  let selectedSeverity = 'all';
  let showDismissed = false;
  let refreshTimer;

  // Severity colors and icons
  const severityConfig = {
    critical: {
      color: 'red',
      icon: '🚨',
      bgClass: 'bg-red-50',
      borderClass: 'border-red-200',
      textClass: 'text-red-900',
      badgeClass: 'bg-red-100 text-red-800'
    },
    warning: {
      color: 'yellow',
      icon: '⚠️',
      bgClass: 'bg-yellow-50',
      borderClass: 'border-yellow-200',
      textClass: 'text-yellow-900',
      badgeClass: 'bg-yellow-100 text-yellow-800'
    },
    info: {
      color: 'blue',
      icon: 'ℹ️',
      bgClass: 'bg-blue-50',
      borderClass: 'border-blue-200',
      textClass: 'text-blue-900',
      badgeClass: 'bg-blue-100 text-blue-800'
    }
  };

  // Filter alerts
  $: filteredAlerts = $alertsStore.filter(alert => {
    if (!showDismissed && alert.dismissed) return false;
    if (selectedSeverity !== 'all' && alert.severity !== selectedSeverity) return false;
    return true;
  }).sort((a, b) => {
    // Sort by severity (critical first) then by timestamp
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const severityDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  // Load alerts
  async function loadAlerts() {
    loading = true;
    try {
      await alertsStore.refresh();
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      loading = false;
    }
  }

  // Handle dismiss
  async function handleDismiss(alertId) {
    try {
      await alertsStore.dismissAlert(alertId);
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
    }
  }

  // Handle remove
  async function handleRemove(alertId) {
    try {
      await alertsStore.removeAlert(alertId);
    } catch (error) {
      console.error('Failed to remove alert:', error);
    }
  }

  // Clear all alerts
  async function handleClearAll() {
    if (confirm('Are you sure you want to clear all alerts?')) {
      try {
        await alertsStore.clearAlerts();
      } catch (error) {
        console.error('Failed to clear alerts:', error);
      }
    }
  }

  // Format timestamp
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Setup auto-refresh
  function startAutoRefresh() {
    if (autoRefresh && refreshInterval > 0) {
      refreshTimer = setInterval(loadAlerts, refreshInterval);
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  onMount(() => {
    loadAlerts();
    startAutoRefresh();
  });

  onDestroy(() => {
    stopAutoRefresh();
    alertsStore.destroy();
  });
</script>

<div class="alerts-panel bg-white rounded-lg border border-gray-200 shadow-sm {className}">
  <!-- Header -->
  {#if showHeader}
    <div class="px-4 py-3 border-b border-gray-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold text-gray-900">Alerts</h3>
          <div class="flex gap-2">
            <span class="px-2 py-1 text-xs font-medium rounded-full {severityConfig.critical.badgeClass}">
              {$alertCounts.critical} Critical
            </span>
            <span class="px-2 py-1 text-xs font-medium rounded-full {severityConfig.warning.badgeClass}">
              {$alertCounts.warning} Warning
            </span>
            <span class="px-2 py-1 text-xs font-medium rounded-full {severityConfig.info.badgeClass}">
              {$alertCounts.info} Info
            </span>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <button
            on:click={loadAlerts}
            disabled={loading}
            class="p-1.5 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Refresh alerts"
          >
            <svg class="w-5 h-5 {loading ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          {#if $alertsStore.length > 0}
            <button
              on:click={handleClearAll}
              class="p-1.5 text-gray-500 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
              aria-label="Clear all alerts"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Filters -->
  {#if showFilters}
    <div class="px-4 py-2 border-b border-gray-200 flex items-center gap-3">
      <select
        bind:value={selectedSeverity}
        class="text-sm px-2 py-1 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Severities</option>
        <option value="critical">Critical</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
      
      <label class="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          bind:checked={showDismissed}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Show dismissed
      </label>
    </div>
  {/if}

  <!-- Alerts list -->
  <div class="alerts-list overflow-y-auto" style="max-height: {maxHeight}">
    {#if loading && $alertsStore.length === 0}
      <div class="flex items-center justify-center py-8">
        <LoadingSpinner size="md" message="Loading alerts..." />
      </div>
    {:else if filteredAlerts.length === 0}
      <div class="text-center py-8 text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p>No alerts to display</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-200">
        {#each filteredAlerts as alert (alert.id)}
          <div
            animate:flip={{ duration: 200 }}
            transition:slide={{ duration: 200 }}
            class="p-4 hover:bg-gray-50 {alert.dismissed ? 'opacity-60' : ''}"
          >
            <div class="flex items-start gap-3">
              <!-- Icon -->
              <span class="text-xl flex-shrink-0">
                {severityConfig[alert.severity]?.icon || '📋'}
              </span>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <h4 class="font-medium text-gray-900">
                      {alert.title}
                      {#if alert.dismissed}
                        <span class="ml-2 text-xs text-gray-500">(Dismissed)</span>
                      {/if}
                    </h4>
                    <p class="text-sm text-gray-600 mt-1">{alert.message}</p>
                  </div>
                  <span class="text-xs text-gray-500 whitespace-nowrap">
                    {formatTimestamp(alert.timestamp)}
                  </span>
                </div>

                <!-- Actions -->
                <div class="mt-2 flex gap-2">
                  {#if !alert.dismissed}
                    <button
                      on:click={() => handleDismiss(alert.id)}
                      class="text-xs font-medium text-gray-600 hover:text-gray-800"
                    >
                      Dismiss
                    </button>
                  {/if}
                  <button
                    on:click={() => handleRemove(alert.id)}
                    class="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .alerts-list {
    scrollbar-width: thin;
    scrollbar-color: #e5e7eb #f9fafb;
  }

  .alerts-list::-webkit-scrollbar {
    width: 6px;
  }

  .alerts-list::-webkit-scrollbar-track {
    background: #f9fafb;
  }

  .alerts-list::-webkit-scrollbar-thumb {
    background: #e5e7eb;
    border-radius: 3px;
  }

  .alerts-list::-webkit-scrollbar-thumb:hover {
    background: #d1d5db;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>