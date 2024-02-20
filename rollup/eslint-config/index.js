module.exports = {
    env: {
        commonjs: true,
        es2020: true,
        jest: true,
    },
    extends: ['prettier', 'plugin:markdown/recommended'],
    parser: '@babel/eslint-parser',
    parserOptions: {
        ecmaVersion: 11,
        requireConfigFile: false,
    },
    plugins: ['no-only-tests'],
    ignorePatterns: ['coverage/', '.nyc_output/'],
    overrides: [
        {
            files: ['*.json'],
            plugins: ['json'],
            extends: ['plugin:json/recommended'],
        },
        {
            files: ['*.yaml', '*.yml'],
            plugins: ['yaml'],
            extends: ['plugin:yaml/recommended'],
        },
    ],
    rules: {
        'no-only-tests/no-only-tests': ['error', { fix: false }],
        'no-unused-vars': [
            'warn',
            { vars: 'all', args: 'after-used', ignoreRestSiblings: false },
        ],
        'no-console': ['warn'],
        camelcase: ['warn'],
        'no-mixed-requires': ['warn'],
        'no-warning-comments': ['warn'],
    },
};
