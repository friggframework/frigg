# Migration Guide: From create-frigg-app to frigg init

## Overview

This guide helps you migrate from the standalone `create-frigg-app` package to the new integrated `frigg init` command. The new approach consolidates all Frigg tooling into a single CLI and introduces a powerful local management GUI.

## Key Changes

### Before (create-frigg-app)
```bash
npx create-frigg-app my-app-integrations
cd my-app-integrations
npm start
```

### After (frigg init)
```bash
npm install -g @friggframework/cli
frigg init my-app-integrations
cd my-app-integrations
frigg ui  # Launch management GUI
frigg start  # Or start from CLI
```

## Benefits of Migration

1. **Unified Tooling**: All Frigg tools in one CLI
2. **Visual Management**: Local GUI for integration development
3. **Better DX**: Streamlined workflow with visual tools
4. **Enhanced Features**: Production monitoring, code generation, and more
5. **Multi-Framework Support**: React, Vue, Svelte, and Angular bindings

## Migration Steps

### Step 1: Install the New Frigg CLI

```bash
npm install -g @friggframework/cli
```

### Step 2: Migrate Existing Projects

For existing projects created with `create-frigg-app`:

```bash
cd your-existing-frigg-app
frigg migrate --from-create-frigg-app
```

This command will:
- Update package.json dependencies
- Restructure directories if needed
- Add new configuration files
- Preserve your existing integrations

### Step 3: Update Your Workflow

#### Old Workflow
```bash
# Creating a new app
npx create-frigg-app my-app

# Installing modules
cd my-app
npm install @friggframework/module-hubspot

# Starting development
npm start
```

#### New Workflow
```bash
# Creating a new app
frigg init my-app

# Installing modules (visual)
frigg ui
# Or via CLI
frigg install hubspot

# Starting development
frigg start
# Or with GUI
frigg ui
```

## New Features Available

### 1. Management GUI (`frigg ui`)

Launch a visual interface for:
- Integration discovery and installation
- Connection management
- Environment variable editing
- Local testing
- Production monitoring

### 2. Enhanced CLI Commands

```bash
frigg init [project]      # Create new project
frigg create [integration] # Create custom integration
frigg manage              # Project management
frigg monitor [instance]  # Production monitoring
```

### 3. Multi-Framework Support

Use Frigg UI components with any framework:
- `@friggframework/ui-react`
- `@friggframework/ui-vue`
- `@friggframework/ui-svelte`
- `@friggframework/ui-angular`

## Common Issues and Solutions

### Issue: Frontend Directory Confusion

**Old**: Templates included a frontend directory, causing confusion about Frigg's purpose.

**New**: Clear backend service focus with optional UI bindings for different frameworks.

### Issue: Module Installation

**Old**: Manual npm install of modules
```bash
npm install @friggframework/module-hubspot
```

**New**: Interactive installation
```bash
frigg install
# Or specific module
frigg install hubspot
```

### Issue: Environment Management

**Old**: Manual .env file editing

**New**: Visual environment editor in GUI or enhanced CLI:
```bash
frigg env set API_KEY=xxx
frigg env list
```

## Deprecation Timeline

- **Now - 3 months**: Both approaches supported
- **3-6 months**: Deprecation warnings on create-frigg-app
- **After 6 months**: create-frigg-app archived

## Getting Help

### Documentation
- [Frigg CLI Reference](/docs/reference/cli.md)
- [Management GUI Guide](/docs/guides/management-gui.md)
- [Video Tutorials](/docs/tutorials/video-guides.md)

### Support
- GitHub Issues: https://github.com/friggframework/frigg/issues
- Slack Community: https://frigg-community.slack.com
- Email: support@frigg.io

## FAQ

**Q: Will my existing integrations work after migration?**
A: Yes, all existing integrations are fully compatible.

**Q: Do I need to use the GUI?**
A: No, the GUI is optional. All features are available via CLI.

**Q: Can I still use create-frigg-app?**
A: Yes, for the next 6 months with deprecation warnings.

**Q: What about my custom configurations?**
A: The migration tool preserves all custom configurations.

## Next Steps

1. Install the new Frigg CLI
2. Try creating a new project with `frigg init`
3. Explore the management GUI with `frigg ui`
4. Migrate existing projects when ready
5. Join our community for support

Welcome to the new, improved Frigg developer experience!