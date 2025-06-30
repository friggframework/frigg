<script setup>
import { ref, onMounted } from 'vue';
import { useIntegrations } from '../composables/useIntegrations';

const { integrations, loading, loadIntegrations } = useIntegrations();

const stats = ref({
  active: 0,
  total: 0,
  apiCalls: 1234
});

onMounted(async () => {
  await loadIntegrations();
  stats.value.total = integrations.value.length;
  stats.value.active = integrations.value.filter(i => i.enabled).length;
});
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
    
    <div v-if="loading" class="flex justify-center items-center h-64">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div class="card p-6">
          <h3 class="text-lg font-medium mb-2">Active Integrations</h3>
          <p class="text-3xl font-bold text-primary">{{ stats.active }}</p>
        </div>

        <div class="card p-6">
          <h3 class="text-lg font-medium mb-2">Total Integrations</h3>
          <p class="text-3xl font-bold text-primary">{{ stats.total }}</p>
        </div>

        <div class="card p-6">
          <h3 class="text-lg font-medium mb-2">API Calls Today</h3>
          <p class="text-3xl font-bold text-primary">{{ stats.apiCalls.toLocaleString() }}</p>
        </div>
      </div>

      <div class="mt-8">
        <h2 class="text-xl font-semibold mb-4">Recent Activity</h2>
        <div class="card p-6">
          <p class="text-muted-foreground">No recent activity to display.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card {
  background-color: var(--frigg-background);
  border: 1px solid var(--frigg-border);
  border-radius: 0.5rem;
}
</style>