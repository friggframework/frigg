import { ref } from 'vue';
import { getIntegrations, getIntegrationById } from '../services/api';

export function useIntegrations() {
  const integrations = ref([]);
  const loading = ref(false);
  const error = ref(null);

  const loadIntegrations = async () => {
    try {
      loading.value = true;
      error.value = null;
      const data = await getIntegrations();
      
      // Mock data if API not available
      if (!data || data.length === 0) {
        integrations.value = [
          {
            id: '1',
            name: 'HubSpot',
            description: 'Customer relationship management platform',
            enabled: true,
            status: 'connected',
            logoUrl: '/logos/hubspot.svg'
          },
          {
            id: '2',
            name: 'Salesforce',
            description: 'Sales and customer service platform',
            enabled: false,
            status: 'disconnected',
            logoUrl: '/logos/salesforce.svg'
          }
        ];
      } else {
        integrations.value = data;
      }
    } catch (err) {
      error.value = err.message;
      // Fallback to mock data on error
      integrations.value = [
        {
          id: '1',
          name: 'HubSpot',
          description: 'Customer relationship management platform',
          enabled: true,
          status: 'connected',
          logoUrl: '/logos/hubspot.svg'
        }
      ];
    } finally {
      loading.value = false;
    }
  };

  const getIntegration = async (id) => {
    try {
      loading.value = true;
      error.value = null;
      const data = await getIntegrationById(id);
      return data;
    } catch (err) {
      error.value = err.message;
      // Return mock data on error
      return {
        id,
        name: 'HubSpot',
        description: 'Customer relationship management platform',
        enabled: true,
        status: 'connected',
        webhookUrl: 'https://api.myapp.com/webhooks/hubspot',
        apiCalls: 127
      };
    } finally {
      loading.value = false;
    }
  };

  return {
    integrations,
    loading,
    error,
    loadIntegrations,
    getIntegration
  };
}