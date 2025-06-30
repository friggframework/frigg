<script>
	import { page } from '$app/stores';

	const navigation = [
		{ name: 'Dashboard', href: '/' },
		{ name: 'Integrations', href: '/integrations' },
		{ name: 'Settings', href: '/settings' }
	];

	$: currentPath = $page.url.pathname;
</script>

<div class="min-h-screen bg-background">
	<nav class="border-b">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<img
							class="h-8 w-auto"
							src="/frigg-logo.svg"
							alt="Frigg"
						/>
					</div>
					<div class="ml-10 flex items-baseline space-x-4">
						{#each navigation as item}
							<a
								href={item.href}
								class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
									currentPath === item.href
										? 'bg-muted text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								}`}
							>
								{item.name}
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</nav>

	<main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
		<slot />
	</main>
</div>