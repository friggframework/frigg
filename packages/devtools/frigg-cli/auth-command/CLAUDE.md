# CLAUDE.md - Frigg Authenticator

This file provides guidance to Claude Code when working with the Frigg Authenticator tool.

## Overview

The Frigg Authenticator is a CLI tool for testing API module authentication flows. It's part of `@friggframework/devtools` and enables developers to validate OAuth2 and API-Key authentication without deploying full Frigg infrastructure.

## Directory Structure

```
auth-command/
├── index.js                 # Main CLI command handler (test, list, get, delete)
├── module-loader.js         # Dynamic module loading & validation
├── credential-storage.js    # .frigg-credentials.json persistence
├── oauth-callback-server.js # Local HTTP server for OAuth callbacks
├── oauth-flow.js            # OAuth2 flow orchestration
├── api-key-flow.js          # API-Key authentication flow
├── auth-tester.js           # Run testAuthRequest & sample API calls
├── utils/
│   └── browser.js           # Cross-platform browser opening
├── README.md                # User documentation
└── CLAUDE.md                # This file - AI assistant guidance
```

## Key Files and Their Purpose

### `index.js` - Command Handler
Main entry point that exports `authCommand` object with methods:
- `test(moduleName, options)` - Test authentication for a module
- `list(options)` - List saved credentials
- `get(moduleName, options)` - Retrieve credentials
- `delete(moduleName, options)` - Remove credentials

**When to modify:** Adding new subcommands or changing command behavior.

### `module-loader.js` - Module Loading
Handles dynamic loading of API modules from various sources:
- Current directory (`.`)
- Relative/absolute paths (`./path/to/module`)
- Short names (`attio` → `@friggframework/api-module-attio`)
- Full package names (`@friggframework/api-module-attio`)

**Key functions:**
- `loadModule(moduleIdentifier)` - Load and return `{definition, Api, modulePath}`
- `validateModule(definition)` - Ensure module has required fields
- `getAuthType(Api)` - Detect auth type (oauth2 or apiKey)

**When to modify:** Supporting new module locations or validation rules.

### `credential-storage.js` - Persistence
Manages `.frigg-credentials.json` file:
- Stores credentials per module
- Supports global (`~/.frigg-credentials.json`) and local storage
- Auto-adds to `.gitignore`

**Key class:** `CredentialStorage`
- `save(moduleName, credentials, authType)`
- `get(moduleName)`
- `list()`
- `delete(moduleName)`
- `deleteAll()`

**When to modify:** Changing storage format or location logic.

### `oauth-callback-server.js` - OAuth Server
Local HTTP server that captures OAuth callbacks:
- Listens on configurable port (default: 3333)
- Handles `?code=` and `?error=` query params
- Returns success/error HTML pages
- Implements timeout handling

**Key class:** `OAuthCallbackServer`
- `start()` - Start the server
- `waitForCode()` - Promise that resolves with `{code, state}`
- `stop()` - Shutdown the server

**When to modify:** Changing callback behavior or HTML responses.

### `oauth-flow.js` - OAuth2 Orchestration
Orchestrates the complete OAuth2 flow:
1. Generate CSRF state token
2. Create API instance with env params
3. Get authorization URL
4. Start callback server
5. Open browser or print URL
6. Wait for callback
7. Verify state (CSRF protection)
8. Exchange code for tokens via `getToken()`
9. Fetch entity details via `getEntityDetails()`
10. Return credentials object

**Key function:** `runOAuthFlow(definition, ApiClass, options)`

**When to modify:** Changing OAuth flow steps or adding features.

### `api-key-flow.js` - API-Key Flow
Handles API-Key authentication:
1. Create API instance
2. Set API key via `setApiKey()` or similar
3. Fetch entity details
4. Return credentials object

**Key function:** `runApiKeyFlow(definition, ApiClass, apiKey, options)`

**When to modify:** Supporting different API key mechanisms.

### `auth-tester.js` - Verification
Runs verification tests after authentication:
1. Create fresh API instance with credentials
2. Run `testAuthRequest` from module definition
3. Try common sample API methods
4. Verify credential properties are set

**Key function:** `runAuthTests(definition, ApiClass, credentials, options)`

**When to modify:** Adding verification steps or sample methods.

### `utils/browser.js` - Browser Opening
Cross-platform browser opening utility:
- macOS: `open`
- Windows: `start`
- Linux: `xdg-open`

**Key function:** `openBrowser(url)`

## Integration with Frigg CLI

The authenticator is registered in `frigg-cli/index.js`:

```javascript
const { authCommand } = require('./auth-command');

const authProgram = program
    .command('auth')
    .description('Test API module authentication');

authProgram
    .command('test <module>')
    .action(authCommand.test);
// ... more subcommands
```

## Common Development Tasks

### Adding a New Subcommand

1. Add handler method in `auth-command/index.js`
2. Register in `frigg-cli/index.js` under `authProgram`
3. Update README.md with usage docs

### Supporting a New Auth Type

1. Create new flow file (e.g., `basic-auth-flow.js`)
2. Update `getAuthType()` in `module-loader.js`
3. Add case in `test()` handler in `index.js`

### Changing Credential Format

1. Update `save()` and `get()` in `credential-storage.js`
2. Consider migration for existing credentials
3. Update `_meta.version` for format versioning

### Adding Verification Steps

1. Modify `runAuthTests()` in `auth-tester.js`
2. Add new sample methods to check
3. Update verbose output

## Testing

### Manual Testing

```bash
# Test with a real module
cd /path/to/api-module-attio
export ATTIO_CLIENT_ID=xxx
export ATTIO_CLIENT_SECRET=xxx
export ATTIO_SCOPE="read:objects"
export REDIRECT_URI="http://localhost:3333"
node /path/to/frigg-cli/index.js auth test . --verbose
```

### Unit Testing

Tests should be added to `frigg-cli/test/auth-command.test.js`:
- Test module loading with various paths
- Test credential storage operations
- Mock OAuth callback server responses
- Test error handling

## Error Handling Patterns

### User-Friendly Errors

```javascript
throw new Error(
    `Port ${port} is already in use.\n` +
    `Try using a different port: frigg auth test <module> --port <different-port>`
);
```

### Validation Errors

```javascript
const errors = [];
if (!definition.moduleName) {
    errors.push('Missing required field: moduleName');
}
if (errors.length > 0) {
    throw new Error(`Module validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
}
```

## Dependencies

External packages used:
- `chalk` - Terminal colors
- `commander` - CLI framework (via parent)

Node.js built-ins:
- `http` - Callback server
- `url` - URL parsing
- `fs` - File system
- `path` - Path utilities
- `os` - OS info
- `crypto` - State token generation
- `child_process` - Browser opening
- `readline` - User confirmation

## Security Considerations

1. **State Parameter**: CSRF protection via random state token
2. **Local Only**: Callback server only binds to localhost
3. **No Credential Logging**: Sensitive values are masked in output
4. **Gitignore Integration**: Auto-adds credentials file to .gitignore
5. **Sanitization**: Client secrets removed from stored apiParams

## Common Issues

### Module Not Loading

Check:
- Module exports `{Definition}` or `{definition}`
- Definition has `API` class
- `require('dotenv').config()` is called in definition.js

### OAuth Flow Failing

Check:
- Environment variables are set correctly
- Redirect URI matches callback server port
- OAuth credentials are valid
- Scopes are correct

### Credentials Not Persisting

Check:
- Write permissions on target directory
- File isn't gitignored in a way that prevents reading
- Storage path detection is correct

## Related Documentation

- [Frigg Framework CLAUDE.md](../../CLAUDE.md)
- [API Module Library](https://github.com/friggframework/api-module-library)
- [OAuth2Requester](../../../core/modules/requester/oauth-2.js)
- [ApiKeyRequester](../../../core/modules/requester/ApiKeyRequester.js)
