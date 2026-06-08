# Auth Testing Reference (`frigg auth`)

The Frigg Authenticator (`frigg auth`) tests OAuth2 and API-Key auth flows for an API module without deploying infrastructure. Module definition requirements are in [api-modules.md](api-modules.md).

## Table of Contents

- [Commands & Options](#commands--options)
- [Quick Start (OAuth2)](#quick-start-oauth2)
- [Testing API-Key Modules](#testing-api-key-modules)
- [What It Tests](#what-it-tests)
- [Using Saved Credentials in Tests](#using-saved-credentials-in-tests)
- [Credential Storage & Troubleshooting](#credential-storage--troubleshooting)

## Commands & Options

```bash
frigg auth test <module>     # test OAuth2 or API-Key authentication
frigg auth list              # list all saved credentials
frigg auth get <module>      # retrieve credentials (--json, --export)
frigg auth delete [module]   # remove credentials (--all)
```

Options for `frigg auth test`:
- `--api-key <key>` — use an explicit API key (skips the interactive form)
- `--port <port>` — callback server port (default 3333)
- `--no-browser` — print the authorization URL instead of opening a browser
- `--timeout <seconds>` — OAuth callback timeout (default 300)
- `-v, --verbose` — verbose output

`<module>` accepts a path (`.`, `./path/to/module`) or a short name (`attio` → `@friggframework/api-module-attio`).

## Quick Start (OAuth2)

```bash
cd packages/api-module-attio        # 1. cd to the module
cat .env                            # 2. ensure OAuth creds present
# ATTIO_CLIENT_ID / ATTIO_CLIENT_SECRET / ATTIO_SCOPE / REDIRECT_URI=http://localhost:3333
frigg auth test . --verbose         # 3. run the flow
```

This loads/validates the module, starts a callback server on port 3333, opens the browser to the authorization page, captures the callback, exchanges the code for tokens, runs the auth checks below, and saves to `.frigg-credentials.json`.

## Testing API-Key Modules

Modules with `getAuthorizationRequirements` render an interactive form (password masking via `ui:widget: 'password'`, help text via `ui:help`, required-field validation, multi-field support):

```bash
$ frigg auth test .

📝 Quo API Authorization

  (Your Quo API key)
  API Key: ********************************

🔑 API-Key Authentication Flow
Module: quo
✓ API key configured
```

Skip the form with an explicit key: `frigg auth test . --api-key sk_xxx`.

## What It Tests

- `testAuthRequest` — verifies authentication works
- `getEntityDetails` — validates entity consistency post-auth
- `getCredentialDetails` — verifies credential structure post-auth
- Token refresh — tests the refresh mechanism if supported
- `apiPropertiesToPersist` — verifies persisted credential and entity properties

## Using Saved Credentials in Tests

```javascript
const { CredentialStorage } = require(
  "@friggframework/devtools/frigg-cli/auth-command/credential-storage"
);

describe("Attio Integration", () => {
  let api;
  beforeAll(async () => {
    const storage = new CredentialStorage();
    const credentials = await storage.get("attio");
    if (!credentials) throw new Error('Run "frigg auth test attio" first');

    const { Api } = require("@friggframework/api-module-attio");
    api = new Api({ ...credentials.tokens, ...credentials.apiParams });
  });

  it("should list objects", async () => {
    const result = await api.listObjects();
    expect(result.data).toBeDefined();
  });
});
```

Shell scripts can source credentials directly:

```bash
eval $(frigg auth get attio --export)
# -> ATTIO_ACCESS_TOKEN=xxx, ATTIO_EXTERNAL_ID=workspace-id, ...
```

## Credential Storage & Troubleshooting

Storage locations:
- Project-local: `.frigg-credentials.json` in project root (auto-added to `.gitignore`)
- Global: `~/.frigg-credentials.json`

| Issue | Solution |
| --- | --- |
| Port already in use | `--port 8080` (or another free port) |
| Module not found | use `.` for current dir, or an absolute path |
| OAuth callback timeout | `--timeout 600` |
| Missing environment variables | create `.env` with required credentials |
| Browser doesn't open | `--no-browser` and open the URL manually |
