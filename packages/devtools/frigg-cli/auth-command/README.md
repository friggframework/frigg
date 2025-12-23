# Frigg Authenticator

A CLI tool for testing OAuth2 and API-Key authentication flows in Frigg API modules without deploying full infrastructure.

## Overview

The Frigg Authenticator allows API module developers to:
- Test OAuth2 authentication flows end-to-end
- Test API-Key authentication
- Verify `requiredAuthMethods` work correctly
- Save credentials for reuse in tests
- Debug authentication issues quickly

## Installation

The authenticator is included in `@friggframework/devtools` and available via the Frigg CLI:

```bash
npm install @friggframework/devtools
```

## Quick Start

### Testing OAuth2 Modules

```bash
# Navigate to your API module directory
cd packages/api-module-attio

# Ensure .env has required OAuth credentials
cat .env
# ATTIO_CLIENT_ID=your_client_id
# ATTIO_CLIENT_SECRET=your_client_secret
# ATTIO_SCOPE=read:objects write:objects
# REDIRECT_URI=http://localhost:3333

# Run the auth test
frigg auth test .
```

This will:
1. Load your module and validate its definition
2. Start a local callback server on port 3333
3. Open your browser to the OAuth authorization page
4. Capture the callback and exchange code for tokens
5. Run `testAuthRequest` to verify authentication works
6. Save credentials to `.frigg-credentials.json`

### Testing API-Key Modules

```bash
frigg auth test ./my-api-key-module --api-key YOUR_API_KEY
```

## Commands

### `frigg auth test <module>`

Test authentication for an API module.

**Arguments:**
- `<module>` - Module path or name. Can be:
  - `.` - Current directory
  - `./path/to/module` - Relative path
  - `/absolute/path/to/module` - Absolute path
  - `attio` - Short name (resolves to `@friggframework/api-module-attio`)
  - `@friggframework/api-module-attio` - Full package name

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--api-key <key>` | - | API key for API-Key authentication |
| `--port <port>` | `3333` | Callback server port |
| `--no-browser` | `false` | Don't auto-open browser (print URL instead) |
| `--timeout <seconds>` | `300` | OAuth callback timeout |
| `-v, --verbose` | `false` | Enable verbose output |

**Examples:**
```bash
# Test current directory module
frigg auth test .

# Test with custom port
frigg auth test . --port 8080

# Test without opening browser
frigg auth test . --no-browser

# Test API-Key module
frigg auth test . --api-key sk_live_xxxxx

# Verbose output for debugging
frigg auth test . --verbose
```

### `frigg auth list`

List all saved credentials.

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Example:**
```bash
frigg auth list
```

Output:
```
┌─────────┬───────────┬──────────────────────┬──────────────────┬───────────────────┬─────────────────────┐
│ Module  │ Auth Type │ Entity               │ Has Access Token │ Has Refresh Token │ Saved At            │
├─────────┼───────────┼──────────────────────┼──────────────────┼───────────────────┼─────────────────────┤
│ attio   │ oauth2    │ Left Hook Dev        │ ✓                │ -                 │ 12/23/2025, 7:34 PM │
│ quo     │ apiKey    │ Quo Workspace        │ ✓                │ -                 │ 12/23/2025, 8:00 PM │
└─────────┴───────────┴──────────────────────┴──────────────────┴───────────────────┴─────────────────────┘
```

### `frigg auth get <module>`

Get credentials for a specific module.

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output as JSON (for scripts) |
| `--export` | Output as environment variables |

**Examples:**
```bash
# Display formatted credentials
frigg auth get attio

# Get as JSON for scripts
frigg auth get attio --json

# Export as environment variables
eval $(frigg auth get attio --export)
```

### `frigg auth delete [module]`

Delete saved credentials.

**Options:**
| Option | Description |
|--------|-------------|
| `--all` | Delete all credentials |
| `-y, --yes` | Skip confirmation |

**Examples:**
```bash
# Delete specific module credentials
frigg auth delete attio

# Delete all credentials
frigg auth delete --all

# Skip confirmation
frigg auth delete attio -y
```

## Credential Storage

Credentials are saved to `.frigg-credentials.json`:
- **Project-local**: If run in a Frigg project, saves to project root
- **Global**: Otherwise saves to `~/.frigg-credentials.json`

The file is automatically added to `.gitignore` when saving locally.

### Credential Format

```json
{
  "_meta": {
    "version": 1,
    "warning": "DO NOT COMMIT THIS FILE - contains sensitive credentials"
  },
  "modules": {
    "attio": {
      "authType": "oauth2",
      "tokens": {
        "access_token": "xxx...",
        "refresh_token": null,
        "accessTokenExpire": "2025-12-24T19:34:50.468Z"
      },
      "entity": {
        "identifiers": {
          "externalId": "workspace-id",
          "user": "cli-test-user"
        },
        "details": {
          "name": "My Workspace"
        }
      },
      "obtainedAt": "2025-12-23T19:34:51.097Z",
      "savedAt": "2025-12-23T19:34:51.713Z"
    }
  }
}
```

## Using Credentials in Tests

### Direct Import

```javascript
const { CredentialStorage } = require('@friggframework/devtools/frigg-cli/auth-command/credential-storage');

describe('Attio Integration', () => {
    let api;

    beforeAll(async () => {
        const storage = new CredentialStorage();
        const credentials = await storage.get('attio');

        if (!credentials) {
            throw new Error('Run "frigg auth test attio" first');
        }

        const { Api } = require('@friggframework/api-module-attio');
        api = new Api({
            ...credentials.tokens,
            ...credentials.apiParams,
        });
    });

    it('should list objects', async () => {
        const result = await api.listObjects();
        expect(result.data).toBeDefined();
    });
});
```

### Environment Variables

```bash
# Export credentials as env vars
eval $(frigg auth get attio --export)

# Now available as:
# ATTIO_ACCESS_TOKEN=xxx
# ATTIO_EXTERNAL_ID=workspace-id
```

## Module Requirements

For the authenticator to work, your module must have:

### Required Definition Fields

```javascript
const Definition = {
    API: Api,                    // API class (extends OAuth2Requester or ApiKeyRequester)
    moduleName: 'my-module',     // Unique module name
    requiredAuthMethods: {
        getToken,                // Exchange auth code for tokens (OAuth2)
        getEntityDetails,        // Get entity info after auth
        getCredentialDetails,    // Get credential info
        testAuthRequest,         // Verify auth works
        apiPropertiesToPersist,  // Fields to persist
    },
    env: {
        client_id: process.env.MY_MODULE_CLIENT_ID,
        client_secret: process.env.MY_MODULE_CLIENT_SECRET,
        scope: process.env.MY_MODULE_SCOPE,
        redirect_uri: process.env.REDIRECT_URI,
    }
};
```

### Required Environment Variables

Create a `.env` file in your module directory:

```bash
# OAuth2 modules
MY_MODULE_CLIENT_ID=your_client_id
MY_MODULE_CLIENT_SECRET=your_client_secret
MY_MODULE_SCOPE=read write
REDIRECT_URI=http://localhost:3333

# API-Key modules (pass via --api-key flag)
```

## Troubleshooting

### Port Already in Use

```
Error: Port 3333 is already in use.
Try using a different port: frigg auth test <module> --port <different-port>
```

**Solution:** Use a different port with `--port 8080`

### Module Not Found

```
Error: Could not find module: my-module
```

**Solution:**
- Use `.` for current directory
- Use absolute path
- Ensure module exports `Definition`

### OAuth Callback Timeout

```
Error: OAuth callback timeout after 300 seconds.
```

**Solution:**
- Complete authorization in browser faster
- Increase timeout with `--timeout 600`
- Check redirect URI matches callback server

### Invalid Module Definition

```
Error: Module validation failed:
  - Missing required auth method: testAuthRequest
```

**Solution:** Ensure your module's `requiredAuthMethods` has all required methods.

## Architecture

```
auth-command/
├── index.js                 # Main command handler
├── module-loader.js         # Dynamic module loading & validation
├── credential-storage.js    # .frigg-credentials.json persistence
├── oauth-callback-server.js # Local HTTP server for OAuth callbacks
├── oauth-flow.js            # OAuth2 flow orchestration
├── api-key-flow.js          # API-Key authentication flow
├── auth-tester.js           # Run testAuthRequest & sample API calls
└── utils/
    └── browser.js           # Cross-platform browser opening
```

## Security Considerations

1. **Credentials are stored in plain text** - Only use for development/testing
2. **Auto-adds to .gitignore** - Prevents accidental commits
3. **CSRF protection** - OAuth state parameter prevents attacks
4. **Local callback only** - Server only listens on localhost

## Contributing

See the main [Frigg Contributing Guide](https://github.com/friggframework/frigg/blob/main/CONTRIBUTING.md).
