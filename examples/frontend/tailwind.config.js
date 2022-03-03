module.exports = {
	content: ['./src/**/*.{js,jsx,ts,tsx}'],
	theme: {
		extend: {},
		customForms: (theme) => ({
			default: {
				'input, textarea': {
					'&::placeholder': {
						color: theme('colors.gray.400'),
					},
				},
			},
		}),
	},
	plugins: [
		require('@tailwindcss/forms')({
			strategy: 'class',
		}),
	],
};
