# Frigg Framework Migration Templates

This directory contains migration templates to help developers transition between different frontend frameworks while maintaining their Frigg integrations.

## Available Migrations

### From React
- **To Vue**: Migrate React components to Vue 3 with Composition API
- **To Svelte**: Convert React components to Svelte components
- **To Angular**: Transform React components to Angular standalone components

### From Vue
- **To React**: Convert Vue components to React functional components
- **To Svelte**: Migrate Vue templates and logic to Svelte
- **To Angular**: Transform Vue components to Angular components

### From Svelte
- **To React**: Convert Svelte components to React
- **To Vue**: Transform Svelte components to Vue 3
- **To Angular**: Migrate Svelte components to Angular

### From Angular
- **To React**: Convert Angular components to React
- **To Vue**: Transform Angular components to Vue 3
- **To Svelte**: Migrate Angular components to Svelte

## Migration Strategy

Each migration template includes:

1. **Component Mapping Guide**: How components translate between frameworks
2. **State Management**: Converting state patterns between frameworks
3. **Routing**: Adapting routing configurations
4. **Service Integration**: Maintaining Frigg service integrations
5. **Testing**: Converting test files and patterns
6. **Build Configuration**: Updating build tools and configurations

## Usage

Migration templates are used by the Frigg CLI migration command:

```bash
frigg migrate --from react --to vue
```

This will:
1. Analyze your existing codebase
2. Generate a migration plan
3. Create converted files using appropriate templates
4. Provide a checklist of manual steps required

## Best Practices

1. **Backup First**: Always create a backup before starting migration
2. **Incremental Migration**: Migrate components one at a time
3. **Test Continuously**: Run tests after each component migration
4. **Preserve Frigg Integrations**: Ensure all Frigg connections remain functional
5. **Update Documentation**: Keep component documentation current

## Manual Steps

Some aspects require manual intervention:
- Complex state logic
- Framework-specific optimizations
- Custom hooks/composables/stores
- Third-party integrations
- Styling adjustments

## Framework-Specific Notes

### React → Vue
- Hooks become composables
- JSX becomes template syntax
- Props remain similar

### Vue → React
- Composables become hooks
- Template syntax becomes JSX
- Reactivity model changes

### React/Vue → Svelte
- Simpler syntax
- Built-in reactivity
- No virtual DOM

### Any → Angular
- TypeScript first
- Dependency injection
- Decorators and metadata