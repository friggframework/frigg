# Frigg CLI Package Separation

**Implementation Date:** October 26, 2025
**Status:** ✅ Complete and Tested

---

## 🎯 Objective

Separate the Frigg CLI into a standalone globally-installable npm package that:
- Can be installed globally via `npm i -g @friggframework/frigg-cli`
- Uses the local project's `@friggframework/core` and `@friggframework/devtools` dependencies
- Automatically prefers local CLI installation if it's newer or equal version
- Warns about version mismatches between global and local installations

---

## 📦 Package Structure Changes

### Before

```
@friggframework/devtools
├── package.json (bin: "frigg": "./frigg-cli/index.js")
├── frigg-cli/
│   ├── package.json (workspace:* dependencies)
│   └── index.js
└── infrastructure/
```

**Problems:**
- Installing `@friggframework/devtools` globally installed the entire devtools package
- `workspace:*` dependencies don't resolve in global installs
- No version detection or preference for local installations

### After

```
@friggframework/frigg-cli (standalone package)
├── package.json
│   ├── dependencies: @friggframework/core@^2.0.0-next.0
│   ├── dependencies: @friggframework/devtools@^2.0.0-next.0
│   └── publishConfig: { access: "public" }
└── index.js (with version detection wrapper)

@friggframework/devtools
├── package.json (NO bin entry)
└── infrastructure/
```

**Benefits:**
- Clean separation: CLI is its own package
- Proper version dependencies for npm publish
- Automatic local preference when available
- Version mismatch warnings

---

## 🔍 Version Detection Logic

### How It Works

When you run `frigg` (globally installed), the CLI:

1. **Checks for skip flag**
   If `FRIGG_CLI_SKIP_VERSION_CHECK=true`, skips detection (prevents recursion)

2. **Looks for local installation**
   Searches for `node_modules/@friggframework/frigg-cli` in current directory

3. **Compares versions**
   Uses `semver.compare(localVersion, globalVersion)`

4. **Makes decision**:
   - **Local ≥ Global**: Uses local CLI
     ```
     Using local frigg-cli@2.1.0 (global: 2.0.0)
     ```

   - **Global > Local**: Warns and uses global
     ```
     ⚠️  Version mismatch: global frigg-cli@2.1.0 is newer than local frigg-cli@2.0.0
        Consider updating local version: npm install @friggframework/frigg-cli@latest
     ```

   - **No local**: Uses global silently

### Code Implementation

```javascript
// packages/devtools/frigg-cli/index.js (lines 3-75)

(function versionDetection() {
    // Skip if env var set (prevents recursion)
    if (process.env.FRIGG_CLI_SKIP_VERSION_CHECK === 'true') {
        return;
    }

    const localCliPath = path.join(cwd, 'node_modules', '@friggframework', 'frigg-cli');
    const localVersion = /* read from local package.json */;
    const globalVersion = require('./package.json').version;

    const comparison = semver.compare(localVersion, globalVersion);

    if (comparison >= 0) {
        // Use local CLI via subprocess
        const child = spawn(process.execPath, [localCliIndex, ...args], {
            stdio: 'inherit',
            env: {
                ...process.env,
                FRIGG_CLI_SKIP_VERSION_CHECK: 'true',
            },
        });
        // Exit after delegating to local
        child.on('exit', (code) => process.exit(code));
    } else {
        // Warn about version mismatch
        console.warn(`⚠️  Version mismatch: ...`);
    }
})();
```

---

## 🧪 Test Coverage

**Test File:** `__tests__/unit/version-detection.test.js`

**Results:** ✅ 15/15 tests passing

### Test Categories

1. **Semver Comparison** (5 tests)
   - Local newer than global → prefer local
   - Local equal to global → prefer local
   - Global newer than local → warn and use global
   - Prerelease version handling
   - Release vs prerelease preference

2. **Local CLI Detection** (2 tests)
   - Path construction for node_modules lookup
   - package.json and index.js path validation

3. **Environment Variable Check** (2 tests)
   - Skip detection when `FRIGG_CLI_SKIP_VERSION_CHECK=true`
   - Don't skip when env var not set

4. **Decision Matrix** (4 tests)
   - All version comparison scenarios
   - Expected behavior verification

5. **Argument Forwarding** (2 tests)
   - Extract args from process.argv correctly
   - Forward all args to local CLI

---

## 📋 Installation & Usage

### Global Installation

```bash
# Install globally
npm install -g @friggframework/frigg-cli

# Verify installation
frigg --version
```

### Local Project Setup

```bash
# In your Frigg project
npm install @friggframework/core @friggframework/devtools @friggframework/frigg-cli

# The global CLI will automatically prefer this local version
frigg doctor my-stack
# Output: Using local frigg-cli@2.0.0 (global: 2.0.0)
```

### Version Management

**Scenario 1: Local and Global Same Version**
```bash
$ frigg doctor my-stack
Using local frigg-cli@2.0.0 (global: 2.0.0)
# Uses local installation
```

**Scenario 2: Local Newer Than Global**
```bash
$ frigg doctor my-stack
Using local frigg-cli@2.1.0 (global: 2.0.0)
# Uses local installation (preferred)
```

**Scenario 3: Global Newer Than Local**
```bash
$ frigg doctor my-stack
⚠️  Version mismatch: global frigg-cli@2.1.0 is newer than local frigg-cli@2.0.0
   Consider updating local version: npm install @friggframework/frigg-cli@latest
# Uses global installation with warning
```

**Scenario 4: No Local Installation**
```bash
$ frigg doctor my-stack
# Uses global installation silently
```

---

## 🔧 Package Configuration

### frigg-cli/package.json

```json
{
  "name": "@friggframework/frigg-cli",
  "version": "2.0.0-next.0",
  "bin": {
    "frigg": "./index.js"
  },
  "dependencies": {
    "@friggframework/core": "^2.0.0-next.0",
    "@friggframework/devtools": "^2.0.0-next.0",
    "@friggframework/schemas": "^2.0.0-next.0",
    "semver": "^7.6.0",
    // ... other dependencies
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Key Changes:**
- ✅ Replaced `workspace:*` with concrete versions (`^2.0.0-next.0`)
- ✅ Added `@friggframework/devtools` as dependency
- ✅ Added `publishConfig` for public npm publishing
- ✅ Kept `semver` for version comparison logic

### devtools/package.json

```json
{
  "name": "@friggframework/devtools",
  "version": "2.0.0-next.0",
  // ❌ Removed bin entry (was: "bin": { "frigg": "./frigg-cli/index.js" })
  "dependencies": {
    // ... AWS SDK, infrastructure dependencies
  }
}
```

**Key Changes:**
- ❌ Removed `bin` entry (CLI is now in frigg-cli package)
- ✅ Devtools remains a dependency of frigg-cli

---

## 🚀 Publishing Workflow

### Step 1: Publish frigg-cli

```bash
cd packages/devtools/frigg-cli
npm version patch  # or minor, major
npm publish
```

### Step 2: Update Local Projects

```bash
# In Frigg projects
npm install @friggframework/frigg-cli@latest
```

### Step 3: Update Global Installation

```bash
npm install -g @friggframework/frigg-cli@latest
```

---

## 🔄 Migration Path

### For Existing Users

**Before (using devtools):**
```bash
npm install -g @friggframework/devtools@canary
# Issues: Full devtools package, workspace:* errors
```

**After (using frigg-cli):**
```bash
# Step 1: Uninstall old global devtools
npm uninstall -g @friggframework/devtools

# Step 2: Install new global CLI
npm install -g @friggframework/frigg-cli

# Step 3: Update local project dependencies
npm install @friggframework/frigg-cli@latest
```

### For New Projects

```bash
# Global CLI (once per machine)
npm install -g @friggframework/frigg-cli

# Local project dependencies
npx create-frigg-app my-app
# (Will automatically include @friggframework/frigg-cli in package.json)
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module '@friggframework/devtools'"

**Cause:** Global CLI doesn't have devtools installed
**Fix:**
```bash
npm install -g @friggframework/frigg-cli@latest
```

### Issue: Always using global CLI despite newer local version

**Cause:** Version detection may be skipped
**Debug:**
```bash
# Check if env var is set
echo $FRIGG_CLI_SKIP_VERSION_CHECK

# Verify local installation exists
ls node_modules/@friggframework/frigg-cli/package.json

# Check versions
cat node_modules/@friggframework/frigg-cli/package.json | grep version
frigg --version
```

### Issue: Version mismatch warnings

**Cause:** Local version older than global
**Fix:**
```bash
npm install @friggframework/frigg-cli@latest
```

---

## 📊 Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Global Install** | Full devtools package | Just CLI tool |
| **Dependencies** | workspace:* (broken) | Concrete versions |
| **Version Preference** | No detection | Automatic local preference |
| **Version Warnings** | None | Mismatch alerts |
| **Package Size** | Large (full devtools) | Smaller (CLI only) |
| **Publishability** | Issues with workspace deps | Clean npm publish |

---

## ✅ Verification Checklist

- [x] frigg-cli package.json has concrete version dependencies
- [x] frigg-cli package.json includes publishConfig
- [x] devtools package.json removed bin entry
- [x] Version detection logic implemented
- [x] Environment variable check prevents recursion
- [x] Semver comparison works correctly
- [x] 15 tests covering all scenarios
- [x] All tests passing
- [x] Documentation complete

---

## 🔮 Future Enhancements

1. **Automatic Update Prompts**
   ```bash
   ⚠️  New version available: 2.1.0 (current: 2.0.0)
      Run: npm install -g @friggframework/frigg-cli@latest
   ```

2. **Configuration File Support**
   ```json
   // .friggrc
   {
     "cli": {
       "preferLocal": true,
       "autoUpdate": false
     }
   }
   ```

3. **Telemetry for Version Usage**
   - Track which versions are commonly used
   - Identify when users need migration help

---

**Repository:** friggframework/frigg
**Package:** @friggframework/frigg-cli
**Status:** ✅ Ready for publish

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
