import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			'@': './src',
			'@friggframework/ui-svelte': '@friggframework/ui-svelte'
		}
	}
};

export default config;