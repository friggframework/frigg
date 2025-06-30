# Frigg CLI Template System Guide

This guide covers the comprehensive template system for creating Frigg applications with different frontend frameworks.

## Overview

The Frigg CLI template system supports four major frontend frameworks:
- **React** - Modern React with Vite and functional components
- **Vue 3** - Vue 3 with Composition API and Pinia
- **Svelte** - SvelteKit with modern Svelte features
- **Angular** - Angular with standalone components and modern patterns

## Quick Start

Create a new Frigg application:

```bash
# Interactive mode - select framework and options
frigg init my-app

# Specify framework directly
frigg init my-app --framework react
frigg init my-app --framework vue
frigg init my-app --framework svelte
frigg init my-app --framework angular

# Frontend only (no backend)
frigg init my-app --framework react --no-backend

# With additional options
frigg init my-app --framework vue --force --verbose
```

## Framework Templates

### React Template

**Features:**
- Vite for build tooling
- React Router for navigation
- Tailwind CSS for styling
- Vitest for testing
- ESLint + Prettier for code quality

**Structure:**
```
src/
├── components/     # Reusable components
├── pages/         # Page components
├── hooks/         # Custom hooks
├── services/      # API services
├── utils/         # Utilities
└── test/          # Test setup
```

**Key Files:**
- `vite.config.js` - Vite configuration
- `src/main.jsx` - Application entry point
- `src/App.jsx` - Root component with routing

### Vue 3 Template

**Features:**
- Vite for build tooling
- Vue Router for navigation
- Pinia for state management
- Composition API patterns
- Tailwind CSS for styling

**Structure:**
```
src/
├── components/     # Reusable components
├── views/         # Page components
├── composables/   # Composition functions
├── stores/        # Pinia stores
├── router/        # Router configuration
└── services/      # API services
```

**Key Files:**
- `vite.config.js` - Vite configuration
- `src/main.js` - Application entry point
- `src/App.vue` - Root component

### Svelte Template

**Features:**
- SvelteKit for framework
- File-based routing
- Built-in state management
- TypeScript support
- Tailwind CSS for styling

**Structure:**
```
src/
├── routes/           # SvelteKit routes
├── lib/
│   ├── components/   # Reusable components
│   ├── stores/      # Svelte stores
│   └── utils/       # Utilities
└── app.html         # HTML template
```

**Key Files:**
- `svelte.config.js` - SvelteKit configuration
- `src/routes/+layout.svelte` - Layout component
- `src/app.html` - HTML template

### Angular Template

**Features:**
- Standalone components (Angular 17+)
- Angular Router for navigation
- Services for API integration
- TypeScript first
- Tailwind CSS for styling

**Structure:**
```
src/app/
├── components/     # Reusable components
├── pages/         # Page components
├── services/      # Injectable services
├── models/        # TypeScript interfaces
└── app.routes.ts  # Route configuration
```

**Key Files:**
- `angular.json` - Angular CLI configuration
- `src/main.ts` - Application bootstrap
- `src/app/app.component.ts` - Root component

## Common Features

All templates include:

### Frigg Integration
- Pre-configured API services
- Integration management components
- Dashboard and monitoring views
- Environment configuration

### Development Tools
- Hot module replacement
- Code formatting (Prettier)
- Linting (ESLint)
- Testing framework
- Build optimization

### Styling
- Tailwind CSS setup
- CSS variables for theming
- Dark mode support
- Responsive design patterns

### Project Structure
- Consistent directory organization
- Shared configuration files
- Environment variables
- Git setup

## Configuration Options

### Project Structure Options

**Full-stack (Default)**
```
my-app/
├── package.json      # Workspace configuration
├── frontend/         # Frontend application
├── backend/          # Frigg backend
└── shared/           # Shared configurations
```

**Frontend Only**
```
my-app/
├── package.json      # Frontend package.json
├── src/              # Source code
├── public/           # Static assets
└── ...               # Framework-specific files
```

### Backend Integration

When including a backend:
- Express.js server with Frigg integrations
- Serverless framework configuration
- Docker setup for local development
- Pre-configured API routes
- Authentication middleware

### Workspace Scripts

Full-stack projects include npm workspace scripts:

```json
{
  "scripts": {
    "dev": "concurrently frontend and backend",
    "build": "build both frontend and backend",
    "test": "run tests in all workspaces",
    "lint": "lint all workspaces"
  }
}
```

## Customization

### Adding Custom Templates

1. Create a new directory in `templates/`
2. Follow the existing template structure
3. Update `framework-template-handler.js`
4. Add framework configuration

### Template Variables

Templates support variable substitution:
- `{{projectName}}` - Project name
- `{{frameworkName}}` - Framework name
- `{{apiUrl}}` - API URL configuration

### Hook System

Templates can include hooks for:
- Post-generation processing
- Custom file transformations
- Framework-specific setup

## Migration Between Frameworks

The template system supports migration between frameworks:

```bash
frigg migrate --from react --to vue
```

This will:
1. Analyze existing components
2. Generate equivalent components in target framework
3. Convert routing and state management
4. Preserve Frigg integrations
5. Provide migration checklist

## Best Practices

### Template Development
1. Keep templates minimal and focused
2. Include comprehensive documentation
3. Use consistent naming conventions
4. Provide working examples
5. Test with different configurations

### Project Setup
1. Choose the right framework for your team
2. Consider long-term maintenance
3. Plan for scaling and migration
4. Use consistent code patterns
5. Document custom modifications

### Development Workflow
1. Use provided scripts and tools
2. Follow framework conventions
3. Keep Frigg integrations updated
4. Test regularly across environments
5. Monitor performance and bundle size

## Troubleshooting

### Common Issues

**Template not found**
- Ensure framework name is correct
- Check template directory exists
- Verify CLI version

**Dependency conflicts**
- Clear node_modules and reinstall
- Check for conflicting global packages
- Update to latest CLI version

**Build issues**
- Check environment variables
- Verify API endpoints
- Review build configuration

**Integration problems**
- Confirm backend is running
- Check API routes and CORS
- Verify authentication setup

### Getting Help

1. Check the troubleshooting guide
2. Review framework documentation
3. Search existing issues
4. Ask on community forums
5. Report bugs with reproduction steps

## Contributing

To contribute to the template system:

1. Fork the repository
2. Create feature branch
3. Add/modify templates
4. Update documentation
5. Submit pull request

### Template Guidelines

- Follow existing patterns
- Include comprehensive tests
- Document all features
- Ensure cross-platform compatibility
- Maintain backward compatibility