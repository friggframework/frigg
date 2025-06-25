# Migration Guide: From create-frigg-app to frigg-cli

This guide helps you migrate from the standalone `create-frigg-app` to the new integrated `frigg-cli` commands.

## What's Changed

The functionality of `create-frigg-app` has been integrated directly into the main `frigg-cli` tool. This provides a more unified experience and better integration with the Frigg ecosystem.

### Command Changes

| Old Command | New Command | Description |
|-------------|-------------|-------------|
| `npx create-frigg-app my-app` | `frigg init my-app` | Create a new Frigg application |
| `npx create-frigg-app my-app --template custom` | `frigg init my-app --template custom` | Create with custom template |
| N/A | `frigg create integration-name` | Create a new integration module |
| N/A | `frigg ui` | Launch the management GUI |

## Installation

### Remove the old tool (if globally installed):
```bash
npm uninstall -g create-frigg-app
```

### Install or update frigg-cli:
```bash
npm install -g @friggframework/cli
# or
yarn global add @friggframework/cli
```

## New Features

### 1. Integrated Project Creation
The `frigg init` command replaces `create-frigg-app` with the same functionality:

```bash
frigg init my-new-app
frigg init my-new-app --template @friggframework/custom-template
```

### 2. Integration Module Generator
Create new integration modules directly within your project:

```bash
cd my-frigg-app
frigg create salesforce
# Follow the prompts to configure your integration
```

### 3. Management UI
Launch a web-based management interface:

```bash
frigg ui
# Opens http://localhost:3001 with a management dashboard
```

Options:
- `--port 3002` - Use a different port
- `--no-browser` - Don't auto-open browser
- `--ui-only` - Only start UI (backend already running)

## Updating Existing Projects

If you have an existing project created with `create-frigg-app`, no changes are required. The project structure remains the same.

To use the new CLI commands in your existing project:

1. Update your global CLI:
   ```bash
   npm install -g @friggframework/cli@latest
   ```

2. You can now use the new commands:
   ```bash
   frigg create new-integration
   frigg ui
   frigg build
   frigg deploy
   ```

## Environment Variables

The new commands respect the same environment variables:
- OAuth integrations created with `frigg create` will generate `.env.example` files
- The `frigg ui` command uses your existing backend configuration

## Troubleshooting

### Command not found
If you get "command not found" errors:
1. Ensure frigg-cli is installed globally: `npm list -g @friggframework/cli`
2. Check your PATH includes npm's global bin directory

### Port conflicts
If you get port conflict errors with `frigg ui`:
- Use `--port` and `--api-port` to specify different ports
- Check if other services are running on ports 3000 or 3001

### Template not found
If you get template errors with `frigg init`:
- Ensure the template name is correct
- For custom templates, use the full package name or file path

## Getting Help

- Documentation: https://docs.friggframework.org
- Issues: https://github.com/friggframework/frigg/issues
- Discord: https://discord.gg/friggframework