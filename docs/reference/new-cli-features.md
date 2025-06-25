# Frigg CLI - New Features Documentation

## Overview

The enhanced Frigg CLI consolidates all development tools and introduces powerful new features for building and managing integrations.

## New Commands

### `frigg init`

Initialize a new Frigg project with interactive setup.

```bash
frigg init [project-name] [options]

Options:
  --template <name>     Use specific template (default: basic)
  --no-install         Skip dependency installation
  --git                Initialize git repository
  --verbose            Show detailed output
```

**Templates Available:**
- `basic` - Minimal Frigg backend
- `full` - Backend with all common modules
- `serverless` - AWS-ready configuration
- `docker` - Containerized setup

**Example:**
```bash
frigg init my-integrations --template serverless --git
```

### `frigg create`

Create new integration modules with scaffolding.

```bash
frigg create [integration-name] [options]

Options:
  --type <type>        Integration type (oauth2, apikey, basic)
  --template <name>    Use custom template
  --path <path>        Output directory
```

**Example:**
```bash
frigg create my-custom-crm --type oauth2
```

### `frigg ui`

Launch the local management GUI.

```bash
frigg ui [options]

Options:
  --port <number>      Port for UI server (default: 3001)
  --no-open           Don't open browser automatically
  --env <environment>  Environment to connect to
```

**Features:**
- Visual integration management
- Connection testing
- Environment configuration
- Code generation
- Production monitoring

### `frigg manage`

Project and integration management commands.

```bash
frigg manage <subcommand>

Subcommands:
  list                List all integrations
  enable <name>       Enable an integration
  disable <name>      Disable an integration
  config <name>       Configure integration
  test <name>         Test integration connections
```

### `frigg monitor`

Monitor production Frigg instances.

```bash
frigg monitor [instance] [options]

Options:
  --metrics           Show performance metrics
  --logs              Show recent logs
  --errors            Show only errors
  --tail              Follow log output
  --duration <time>   Time range (e.g., 1h, 24h, 7d)
```

### `frigg env`

Environment variable management.

```bash
frigg env <subcommand>

Subcommands:
  list                List all variables
  set KEY=value       Set variable
  get KEY             Get variable value
  delete KEY          Remove variable
  import <file>       Import from file
  export              Export to .env file
  sync                Sync with AWS SSM
```

### `frigg migrate`

Migration utilities for updating projects.

```bash
frigg migrate [options]

Options:
  --from-create-frigg-app   Migrate from create-frigg-app
  --to-version <version>    Target Frigg version
  --dry-run                 Preview changes
  --backup                  Create backup before migration
```

## Enhanced Existing Commands

### `frigg install`

Now with interactive module selection:

```bash
frigg install [module] [options]

Options:
  --interactive       Launch module browser
  --save-dev         Save as dev dependency
  --configure        Configure after install
```

### `frigg start`

Integration with management GUI:

```bash
frigg start [options]

Options:
  --with-ui          Start with management GUI
  --stage <stage>    Environment stage
  --port <number>    Backend port
  --debug            Enable debug mode
```

### `frigg build`

Multi-environment support:

```bash
frigg build [options]

Options:
  --stage <stage>    Target stage (dev, staging, prod)
  --analyze          Show bundle analysis
  --optimize         Enable optimizations
  --validate         Validate before build
```

### `frigg deploy`

Enhanced deployment validation:

```bash
frigg deploy [options]

Options:
  --stage <stage>    Target stage
  --validate-only    Validate without deploying
  --rollback         Rollback to previous version
  --tag <tag>        Tag this deployment
```

## Configuration

### Project Configuration (frigg.config.js)

```javascript
module.exports = {
  // Project settings
  project: {
    name: 'my-integrations',
    version: '1.0.0',
    description: 'My Frigg integrations'
  },
  
  // CLI settings
  cli: {
    defaultStage: 'dev',
    ui: {
      port: 3001,
      autoOpen: true
    }
  },
  
  // Integration settings
  integrations: {
    autoDiscover: true,
    testTimeout: 30000
  },
  
  // Deployment settings
  deployment: {
    aws: {
      region: 'us-east-1',
      profile: 'default'
    }
  }
};
```

### Environment Configuration

Multiple environment support:

```bash
.env                # Local development
.env.staging        # Staging environment
.env.production     # Production environment
```

## API Reference

### CLI API

Programmatic usage:

```javascript
const { FriggCLI } = require('@friggframework/cli');

const cli = new FriggCLI({
  cwd: process.cwd(),
  silent: false
});

// Initialize project
await cli.init('my-project', {
  template: 'serverless'
});

// Install module
await cli.install('hubspot', {
  configure: true
});

// Start services
await cli.start({
  withUI: true,
  stage: 'dev'
});
```

### Plugin System

Create custom CLI plugins:

```javascript
// frigg-plugin-example.js
module.exports = {
  name: 'example',
  commands: [
    {
      name: 'example:hello',
      description: 'Example command',
      action: async (options) => {
        console.log('Hello from plugin!');
      }
    }
  ]
};
```

Register in frigg.config.js:
```javascript
module.exports = {
  plugins: [
    './frigg-plugin-example.js'
  ]
};
```

## Examples

### Complete Project Setup

```bash
# 1. Install CLI globally
npm install -g @friggframework/cli

# 2. Create new project
frigg init my-integrations --template serverless

# 3. Navigate to project
cd my-integrations

# 4. Launch UI and install modules
frigg ui

# 5. Or install via CLI
frigg install hubspot salesforce

# 6. Configure environment
frigg env set HUBSPOT_API_KEY=xxx
frigg env set SALESFORCE_CLIENT_ID=xxx

# 7. Start development
frigg start --with-ui

# 8. Build for production
frigg build --stage production

# 9. Deploy
frigg deploy --stage production
```

### Custom Integration Development

```bash
# 1. Create custom integration
frigg create my-custom-crm --type oauth2

# 2. Implement integration logic
# Edit: integrations/my-custom-crm/index.js

# 3. Test locally
frigg manage test my-custom-crm

# 4. Enable in project
frigg manage enable my-custom-crm

# 5. Configure
frigg manage config my-custom-crm
```

### Production Monitoring

```bash
# Monitor live instance
frigg monitor production --tail

# Check metrics
frigg monitor production --metrics --duration 24h

# View errors only
frigg monitor production --errors --duration 7d

# Export logs
frigg monitor production --export logs.json
```

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
frigg ui --port 3002
```

**Permission errors:**
```bash
sudo npm install -g @friggframework/cli
```

**Module not found:**
```bash
frigg install --interactive
```

### Debug Mode

Enable verbose logging:
```bash
FRIGG_DEBUG=* frigg start --debug
```

### Getting Help

```bash
frigg --help
frigg <command> --help
frigg docs
```

## Best Practices

1. **Use the UI for exploration**, CLI for automation
2. **Keep environments separate** with proper .env files
3. **Test locally** before deploying
4. **Monitor production** regularly
5. **Use version control** for configurations
6. **Document custom integrations** thoroughly

## Next Steps

- Explore the [Management GUI Guide](/docs/guides/management-gui.md)
- Learn about [Multi-Framework Support](/docs/guides/multi-framework.md)
- Watch [Video Tutorials](/docs/tutorials/video-guides.md)
- Join our [Community](https://frigg-community.slack.com)