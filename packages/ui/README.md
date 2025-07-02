# Frigg Framework UI Libraries

This is a monorepo containing all UI libraries for the Frigg integration framework.

## Structure

- `core/` - Framework-agnostic core utilities and business logic
- `react/` - React components and hooks
- `vue/` - Vue components and composables
- `angular/` - Angular components and services
- `svelte/` - Svelte components and stores

## Packages

- `@friggframework/ui-core` - Core utilities shared by all frameworks
- `@friggframework/ui-react` - React implementation
- `@friggframework/ui-vue` - Vue implementation
- `@friggframework/ui-angular` - Angular implementation
- `@friggframework/ui-svelte` - Svelte implementation
- `@friggframework/ui` - Umbrella package (includes all frameworks)

## Development

This workspace uses npm workspaces for managing dependencies and builds.

### Install dependencies
```bash
npm install
```

### Build all packages
```bash
npm run build
```

### Build specific package
```bash
npm run build:react
npm run build:vue
npm run build:angular
npm run build:svelte
```

### Run tests
```bash
npm test
```

## Usage

### Install specific framework package
```bash
# React
npm install @friggframework/ui-react

# Vue
npm install @friggframework/ui-vue

# Angular
npm install @friggframework/ui-angular

# Svelte
npm install @friggframework/ui-svelte
```

### Install all frameworks (umbrella package)
```bash
npm install @friggframework/ui
```

## Publishing

Each package is published independently to npm. The umbrella package references the workspace versions.