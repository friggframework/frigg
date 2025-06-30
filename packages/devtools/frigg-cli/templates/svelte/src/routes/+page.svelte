<script>
	import { onMount } from 'svelte';
	import { integrations } from '$lib/stores/integrations';
	import LoadingSpinner from '@friggframework/ui-svelte/components/LoadingSpinner.svelte';

	let loading = true;
	let stats = {
		active: 0,
		total: 0,
		apiCalls: 1234
	};

	onMount(async () => {
		await integrations.load();
		const allIntegrations = $integrations;
		stats.total = allIntegrations.length;
		stats.active = allIntegrations.filter(i => i.enabled).length;
		loading = false;
	});
</script>

<svelte:head>
	<title>Dashboard - Frigg Svelte App</title>
</svelte:head>

<div>
	<h1 class="text-3xl font-bold mb-6">Dashboard</h1>
	
	{#if loading}
		<div class="flex justify-center items-center h-64">
			<LoadingSpinner />
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			<div class="card p-6">
				<h3 class="text-lg font-medium mb-2">Active Integrations</h3>
				<p class="text-3xl font-bold text-primary">{stats.active}</p>
			</div>

			<div class="card p-6">
				<h3 class="text-lg font-medium mb-2">Total Integrations</h3>
				<p class="text-3xl font-bold text-primary">{stats.total}</p>
			</div>

			<div class="card p-6">
				<h3 class="text-lg font-medium mb-2">API Calls Today</h3>
				<p class="text-3xl font-bold text-primary">{stats.apiCalls.toLocaleString()}</p>
			</div>
		</div>

		<div class="mt-8">
			<h2 class="text-xl font-semibold mb-4">Recent Activity</h2>
			<div class="card p-6">
				<p class="text-muted-foreground">No recent activity to display.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.card {
		background-color: var(--frigg-background);
		border: 1px solid var(--frigg-border);
		border-radius: 0.5rem;
	}
</style>