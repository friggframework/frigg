# Deployment Issues Fixed in v2.0.0-next

This document outlines the deployment issues that were identified in [GitHub Issue #481](https://github.com/friggframework/frigg/issues/481) and how they have been addressed in the `next` branch.

## Overview

Five critical deployment problems were identified that forced users to implement CI/CD workarounds rather than having the framework handle them natively. All issues have been resolved in this release.

---

## Issue 1: Missing osls Dependency ✅ FIXED

### Problem
The frigg-cli spawned the OSS Serverless (`osls`) subprocess without declaring it as a dependency in `package.json`. Users had to manually install it globally:
```bash
npm install -g osls
```

### Impact
- **Priority**: Medium
- **Affected**: All CI/CD environments and fresh installations
- Every user had to add manual installation steps to their deployment pipelines

### Solution
Added `osls` as a direct dependency in `/packages/frigg-cli/package.json`:
```json
{
  "dependencies": {
    "osls": "^3.40.1"
  }
}
```

### Benefits
- No more manual global installation required
- osls automatically available when frigg-cli is installed
- Consistent versioning across all environments
- Proper dependency tracking in package-lock.json

### Files Changed
- `packages/frigg-cli/package.json` - Added osls dependency
- `packages/frigg-cli/__tests__/unit/dependencies.test.js` - Added test coverage

---

## Issue 2: Prisma Layer Build Cleanup ✅ ALREADY FIXED

### Problem
The Prisma layer build script didn't clean up stale artifacts from interrupted builds, causing `ENOTEMPTY: directory not empty` errors on subsequent deployments.

### Impact
- **Priority**: High
- Random failures blocking deployments after interrupted builds
- Forced users to manually delete `layers/prisma` before each build

### Solution
The build script already includes automatic cleanup in `cleanLayerDirectory()` function:

**File**: `packages/devtools/infrastructure/scripts/build-prisma-layer.js`
```javascript
async function cleanLayerDirectory() {
    logStep(1, 'Cleaning existing layer directory');

    if (await fs.pathExists(LAYER_OUTPUT_PATH)) {
        await fs.remove(LAYER_OUTPUT_PATH);
        logSuccess(`Removed existing layer at ${LAYER_OUTPUT_PATH}`);
    }
}
```

This function runs at the start of every build, ensuring a clean slate.

### Benefits
- No manual cleanup required
- Resilient to interrupted builds
- Consistent build environment every time

---

## Issue 3: Missing esbuild Directories (CRITICAL) ✅ ALREADY FIXED

### Problem
The serverless-esbuild plugin expected `.esbuild/.serverless` directories that Frigg didn't create, blocking ALL CI/CD deployments in clean environments. The issue only worked locally after the first run when directories were created.

### Impact
- **Priority**: Critical
- Blocked all fresh CI/CD deployments
- "Frigg adds the plugin but doesn't handle its requirements"
- Required manual `mkdir -p .esbuild/.serverless` in CI scripts

### Solution
The Frigg Serverless Plugin now creates required directories in multiple hooks:

**File**: `packages/serverless-plugin/index.js`
```javascript
// In asyncInit() - lines 32-41
const esbuildDir = path.join(
    this.serverless.config.servicePath || process.cwd(),
    '.esbuild',
    '.serverless'
);

if (!fs.existsSync(esbuildDir)) {
    fs.mkdirSync(esbuildDir, { recursive: true });
    console.log(`✓ Created ${esbuildDir} directory for serverless-esbuild`);
}

// Also created in beforePackageInitialize() - lines 131-140
// And in init() - lines 147-158
```

The directories are created in THREE different hooks to ensure they exist regardless of which serverless command is run:
1. `initialize` - Early initialization hook
2. `before:package:initialize` - Before packaging starts
3. `asyncInit` - Async initialization for offline mode

### Benefits
- Works in clean CI/CD environments on first run
- No manual directory creation required
- Resilient across different serverless commands
- Clear logging when directories are created

---

## Issue 4: Conflicting Packaging Plugins ✅ FIXED

### Problem
Both serverless-esbuild and serverless-jetpack could coexist in configurations, creating unclear build behavior. No migration guidance from legacy jetpack to modern esbuild.

### Impact
- **Priority**: Medium
- Unclear which plugin handles packaging
- Inconsistent builds across environments
- No clear migration path for legacy projects

### Solution
Added automatic conflict detection and resolution with a new `plugin-validator` utility:

**File**: `packages/devtools/infrastructure/domains/shared/validation/plugin-validator.js`

The validator provides three key functions:

1. **detectConflictingPlugins()** - Identifies when both esbuild and jetpack are present
2. **validateAndCleanPlugins()** - Automatically removes jetpack when esbuild is present
3. **validatePackagingConfiguration()** - Checks for proper esbuild config

**Integration**: `packages/devtools/infrastructure/infrastructure-composer.js`
```javascript
// Validate and clean plugins (detect conflicts, auto-fix if needed)
const pluginValidation = validateAndCleanPlugins(definition.plugins, {
    autoFix: true,
    silent: false,
});

if (pluginValidation.modified) {
    definition.plugins = pluginValidation.plugins;
    console.log('   ✓ Plugin configuration auto-fixed');
}
```

### Behavior

**Scenario 1: Both plugins present**
```
⚠️  Plugin Conflict Detected and Auto-Fixed:
   Removed serverless-jetpack (using serverless-esbuild instead)
   The Frigg framework uses serverless-esbuild as the standard bundling solution.
```

**Scenario 2: Only jetpack present (legacy)**
```
⚠️  Plugin Configuration Warning:
   serverless-jetpack is a legacy packaging plugin.

💡 Recommendations:
   • Consider migrating to serverless-esbuild for improved build times
   • Update your serverless.yml to use serverless-esbuild
   • See docs/reference/aws-sdk-v3-osls-migration.md for guidance
```

**Scenario 3: No packaging plugin**
```
⚠️  Plugin Configuration Warning:
   No packaging plugin detected. Serverless will use default packaging.

💡 Recommendations:
   • Add serverless-esbuild for optimized Lambda bundling
```

### Benefits
- Automatic conflict resolution with clear messaging
- Migration guidance for legacy configurations
- Validates esbuild externalization of AWS SDK and Prisma
- Prevents packaging confusion in CI/CD

### Files Changed
- `packages/devtools/infrastructure/domains/shared/validation/plugin-validator.js` - New validator
- `packages/devtools/infrastructure/domains/shared/validation/plugin-validator.test.js` - Comprehensive tests
- `packages/devtools/infrastructure/infrastructure-composer.js` - Integrated validation

---

## Issue 5: Silent AWS Discovery Failures ✅ ALREADY FIXED

### Problem
AWS resource discovery failed silently when IAM credentials lacked permissions, with no explicit way to disable discovery for restrictive deployment credentials.

### Impact
- **Priority**: Medium
- Discovery failures caused cryptic deployment errors
- No way to explicitly opt-out for limited IAM permissions
- Forced users to grant excessive IAM permissions

### Solution
The framework already supports explicit discovery control via environment variable:

**File**: `packages/devtools/infrastructure/domains/shared/resource-discovery.js`
```javascript
function shouldRunDiscovery(appDefinition) {
    console.log(
        '⚙️  Checking FRIGG_SKIP_AWS_DISCOVERY:',
        process.env.FRIGG_SKIP_AWS_DISCOVERY
    );

    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
        console.log(
            '⚙️  Skipping AWS discovery because FRIGG_SKIP_AWS_DISCOVERY is set.'
        );
        return false;
    }
    // ... rest of logic
}
```

Additionally, discovery errors are caught and handled gracefully:
```javascript
} catch (error) {
    console.error('❌ Cloud resource discovery failed:', error.message);
    console.error('Stack:', error.stack);

    // Don't fail the build - return empty resources
    console.warn(
        '⚠️  Continuing with empty discovered resources.'
    );
    return {};
}
```

### Usage

To skip AWS discovery in CI/CD with limited IAM:
```bash
export FRIGG_SKIP_AWS_DISCOVERY=true
frigg deploy --stage prod
```

Or in package.json scripts:
```json
{
  "scripts": {
    "deploy:ci": "FRIGG_SKIP_AWS_DISCOVERY=true frigg deploy"
  }
}
```

### Benefits
- Explicit control over discovery behavior
- Clear logging when discovery is skipped
- Graceful degradation on discovery failures
- Supports restrictive IAM policies in CI/CD
- No more silent failures

---

## Testing

All fixes include comprehensive test coverage following TDD best practices:

### Plugin Validator Tests
```bash
npm test -- packages/devtools/infrastructure/domains/shared/validation/plugin-validator.test.js
```

Test coverage includes:
- Conflict detection scenarios
- Auto-fix behavior
- Legacy configuration warnings
- Edge cases (empty arrays, undefined values)
- Integration with standard Frigg plugin configuration

### Dependency Tests
```bash
npm test -- packages/frigg-cli/__tests__/unit/dependencies.test.js
```

Test coverage includes:
- osls dependency presence and version
- All critical runtime dependencies
- package.json structure validation

### Existing Tests
All existing test suites continue to pass, validating:
- Serverless plugin directory creation
- Prisma layer build cleanup
- AWS resource discovery control

---

## Migration Guide

### For Existing Projects

1. **Update dependencies**:
   ```bash
   cd packages/frigg-cli
   npm install
   ```

2. **If using serverless-jetpack**, remove it:
   ```yaml
   # serverless.yml or infrastructure config
   plugins:
     - serverless-esbuild  # Keep this
     # - serverless-jetpack  # Remove this
   ```

   The framework will auto-detect and warn if both are present.

3. **Review IAM permissions**:
   - If your CI/CD uses restrictive IAM, set `FRIGG_SKIP_AWS_DISCOVERY=true`
   - See `docs/reference/ssm-configuration.md` for required IAM permissions

### For New Projects

No action required! All fixes are automatic when using:
```bash
npx @friggframework/frigg-cli init my-project
```

---

## Architecture Notes

These fixes follow the **Hexagonal Architecture** (Ports & Adapters) pattern used throughout Frigg:

- **Issue 1**: Infrastructure Layer (package management)
- **Issue 2**: Utility Layer (build scripts)
- **Issue 3**: Infrastructure Layer (serverless plugin hooks)
- **Issue 4**: Domain Layer (validation service) + Application Layer (orchestration)
- **Issue 5**: Domain Layer (discovery service) + Infrastructure Layer (AWS adapters)

All solutions maintain separation of concerns and testability principles.

---

## References

- [GitHub Issue #481](https://github.com/friggframework/frigg/issues/481)
- [AWS SDK v3 & OSLS Migration Guide](./aws-sdk-v3-osls-migration.md)
- [SSM Configuration](./ssm-configuration.md)
- [VPC Configuration](./vpc-configuration.md)

---

## Summary

| Issue | Status | Priority | Auto-Fixed |
|-------|--------|----------|------------|
| #1 osls dependency | ✅ Fixed | Medium | N/A (package.json) |
| #2 Prisma cleanup | ✅ Already Fixed | High | Yes (automatic) |
| #3 esbuild directories | ✅ Already Fixed | Critical | Yes (automatic) |
| #4 Plugin conflicts | ✅ Fixed | Medium | Yes (with warning) |
| #5 Discovery failures | ✅ Already Fixed | Medium | Yes (via env var) |

**All deployment issues from #481 are now resolved.** The framework handles these scenarios automatically, eliminating the need for CI/CD workarounds.
