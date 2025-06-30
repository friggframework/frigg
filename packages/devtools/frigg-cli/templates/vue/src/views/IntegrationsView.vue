<script setup>
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useIntegrations } from '../composables/useIntegrations';
import IntegrationCard from '@friggframework/ui-vue/components/IntegrationCard.vue';

const { integrations, loading, loadIntegrations } = useIntegrations();

onMounted(() => {
  loadIntegrations();
});

const handleToggle = (integrationId, enabled) => {
  console.log('Toggle integration:', integrationId, enabled);
  // TODO: Implement API call
};
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Integrations</h1>
      <button class="btn btn-primary">Add Integration</button>
    </div>

    <div v-if="loading" class="flex justify-center items-center h-64">
      <LoadingSpinner />
    </div>

    <div v-else-if="integrations.length === 0" class="text-center py-12">
      <p class="text-muted-foreground mb-4">No integrations configured yet.</p>
      <button class="btn btn-primary">Configure Your First Integration</button>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="integration in integrations"
        :key="integration.id"
        :to="`/integrations/${integration.id}`"
        class="block"
      >
        <IntegrationCard
          :integration="integration"
          @toggle="(enabled) => handleToggle(integration.id, enabled)"
        />
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.btn {
  @apply px-4 py-2 rounded-md font-medium transition-colors;
}

.btn-primary {
  @apply bg-primary text-white hover:bg-primary-hover;
}
</style>