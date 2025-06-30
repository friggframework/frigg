import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { getIntegrations } from '$lib/api';

function createIntegrations() {
	const { subscribe, set, update } = writable([]);

	return {
		subscribe,
		load: async () => {
			if (!browser) return;
			
			try {
				const data = await getIntegrations();
				
				// Mock data if API not available
				if (!data || data.length === 0) {
					set([
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
					]);
				} else {
					set(data);
				}
			} catch (error) {
				console.error('Failed to load integrations:', error);
				// Fallback to mock data
				set([
					{
						id: '1',
						name: 'HubSpot',
						description: 'Customer relationship management platform',
						enabled: true,
						status: 'connected',
						logoUrl: '/logos/hubspot.svg'
					}
				]);
			}
		},
		toggle: (id, enabled) => {
			update(integrations => 
				integrations.map(integration => 
					integration.id === id ? { ...integration, enabled } : integration
				)
			);
		}
	};
}

export const integrations = createIntegrations();