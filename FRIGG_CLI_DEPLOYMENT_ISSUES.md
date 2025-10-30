# TODO: Fix Frigg Framework Deployment Issues

## Issue 1: osls Not Declared as frigg-cli Dependency

### Problem
The `@friggframework/frigg-cli` package uses `osls` (OSS Serverless) as a subprocess for deployments, but doesn't declare it as a dependency.

### Impact
- Users must install `osls` globally or it will fail with `spawn osls ENOENT`
- CI/CD workflows require extra step to install osls globally
- Not following npm best practices for dependency management

### Evidence
```javascript
// packages/frigg-cli/deploy-command/index.js
const command = 'osls';  // OSS-Serverless (drop-in replacement for serverless v3)

// packages/frigg-cli/build-command/index.js
const command = 'osls';  // OSS-Serverless (drop-in replacement for serverless v3)
```

### Fix Required
Add `osls` to `packages/frigg-cli/package.json`:

```json
{
  "dependencies": {
    "osls": "^3.40.1",
    // ... other deps
  }
}
```

### Current Workaround
Frontify-frigg repo has temporary workaround:
```yaml
# .github/workflows/deploy.yml
- name: Install osls globally
  run: npm install -g osls
```

### Priority
Medium - affects all new deployments but workaround exists

### References
- osls in devtools: `packages/devtools/package.json` has `osls@^3.40.1` as devDependency
- Usage in frigg-cli: `packages/frigg-cli/deploy-command/index.js`, `packages/frigg-cli/build-command/index.js`

---

## Issue 2: Prisma Layer Build Doesn't Clean Stale Artifacts

### Problem
The Prisma Lambda layer build script (`packages/devtools/infrastructure/scripts/build-prisma-layer.js`) doesn't clean up stale artifacts before building, causing ENOTEMPTY errors when directories have partial/corrupted files from previous builds.

### Impact
- Deployments fail with cryptic npm errors: `ENOTEMPTY: directory not empty`
- Failed deployments leave behind corrupt layer directories
- Subsequent deployments fail until manual cleanup
- Poor developer experience - unclear error messages

### Evidence
```
npm error syscall rmdir
npm error path /backend/layers/prisma/nodejs/node_modules/@prisma/client/runtime
npm error errno -39
npm error ENOTEMPTY: directory not empty, rmdir '...'
```

### Root Cause
In `packages/devtools/infrastructure/scripts/build-prisma-layer.js`:
- Function `buildPrismaLayer()` creates layer directory structure
- Doesn't clean existing `layers/prisma` before starting
- If previous build failed or was interrupted, partial files remain
- npm install fails when trying to write to existing directories

### Fix Required

**Option 1: Clean at start of build (recommended)**
```javascript
// packages/devtools/infrastructure/scripts/build-prisma-layer.js
async function buildPrismaLayer(config) {
    const { layerPath, targetEnv } = config;

    // Add cleanup at the beginning
    if (fs.existsSync(layerPath)) {
        console.log(`Cleaning existing layer directory: ${layerPath}`);
        await fs.rm(layerPath, { recursive: true, force: true });
    }

    // ... rest of build logic
}
```

**Option 2: Robust error handling**
```javascript
// packages/devtools/infrastructure/scripts/build-prisma-layer.js
async function installPrismaPackages(layerNodeModules) {
    const targetDir = path.join(layerNodeModules, '@prisma/client');

    // Clean target directory before install
    if (fs.existsSync(targetDir)) {
        await fs.rm(targetDir, { recursive: true, force: true });
    }

    // ... npm install
}
```

### Current Workaround
Frontify-frigg repo has temporary workaround:
```yaml
# .github/workflows/deploy.yml
- name: Clean Prisma layer directory
  run: |
    echo "Cleaning stale Prisma layer artifacts..."
    rm -rf layers/prisma
    echo "✓ Cleaned layers directory"
```

### Additional Improvements
1. Add retry logic for npm install failures
2. Better error messages explaining the issue
3. Suggest cleanup command in error output
4. Add `--clean` flag to frigg deploy command
5. Implement proper rollback on build failure

### Priority
High - blocks deployments completely when it occurs, poor user experience

### References
- Build script: `packages/devtools/infrastructure/scripts/build-prisma-layer.js`
- Caller: `packages/devtools/infrastructure/domains/shared/utilities/prisma-layer-manager.js`
- Related: Infrastructure composer at `packages/devtools/infrastructure/infrastructure-composer.js`

---

## Issue 3: serverless-esbuild Missing .serverless Directory

### Problem
The `serverless-esbuild` plugin expects a `.esbuild/.serverless` directory to exist before packaging, but the directory isn't created automatically in CI/CD environments or fresh checkouts.

**IMPORTANT**: Since Frigg's infrastructure builder adds `serverless-esbuild` to the plugins list, Frigg (via the serverless plugin or deploy command) should handle creating the required directories. This is Frigg's responsibility, not the user's.

### Impact
- Deployment fails with: `ENOENT: no such file or directory, lstat '.esbuild/.serverless'`
- Blocks all deployments in clean environments
- Not reproducible locally (directory gets created on first run and persists)
- CI/CD environments always start clean, so always fail
- Forces every Frigg user to add workarounds to their CI/CD pipelines

### Evidence
```
Error: ENOENT: no such file or directory, lstat '/home/runner/work/frigg-integrations/frigg-integrations/backend/.esbuild/.serverless'
Docs:        github.com/oss-serverless/serverless

× Stack create-frigg-app-production failed to deploy (128s)
```

### Root Cause
1. `serverless-esbuild` plugin is added to serverless config by Frigg infrastructure builder
2. Plugin expects `.esbuild/.serverless` directory to exist for temporary build artifacts
3. In CI/CD, repository is checked out fresh each time - directory doesn't exist
4. Plugin doesn't create directory automatically, assumes it exists
5. **Frigg adds the plugin but doesn't handle its requirements** - This is the core issue
6. Deployment fails before even starting package process

### Fix Required

**Option 1: Pre-create directory in @friggframework/serverless-plugin (BEST)**
```javascript
// packages/devtools/serverless-plugin/index.js
class FriggServerlessPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.hooks = {
            'before:package:initialize': this.ensureBuildDirectories.bind(this),
        };
    }

    async ensureBuildDirectories() {
        const fs = require('fs').promises;
        const path = require('path');

        // Ensure directories required by serverless-esbuild exist
        const buildDirs = [
            '.esbuild',
            '.esbuild/.serverless'
        ];

        for (const dir of buildDirs) {
            await fs.mkdir(dir, { recursive: true });
        }

        this.serverless.cli.log('✓ Created build directories for serverless-esbuild');
    }
}
```

**Option 2: Pre-create directory in frigg deploy command**
```javascript
// packages/frigg-cli/deploy-command/index.js
async function deploy(options) {
    // Ensure serverless-esbuild directories exist
    const esbuildDirs = [
        '.esbuild',
        '.esbuild/.serverless'
    ];

    for (const dir of esbuildDirs) {
        await fs.mkdir(dir, { recursive: true });
    }

    // ... rest of deploy logic
}
```

**Option 3: Add to infrastructure builder**
```javascript
// packages/devtools/infrastructure/infrastructure-composer.js
async function composeServerlessDefinition(appDefinition, options) {
    // Create required directories for serverless-esbuild
    const backendDir = process.cwd();
    const esbuildDir = path.join(backendDir, '.esbuild');
    const serverlessDir = path.join(esbuildDir, '.serverless');

    await fs.mkdir(serverlessDir, { recursive: true });

    // ... rest of composition
}
```

**Recommendation**: Option 1 is best because:
- Frigg serverless plugin already runs as part of the deployment process
- Can hook into `before:package:initialize` lifecycle event
- Centralized location for Frigg-specific serverless setup
- Won't run if serverless-esbuild isn't in the plugins list
- Follows separation of concerns - plugin handles plugin requirements

### Current Workaround
Frontify-frigg repo needs to add:
```yaml
# .github/workflows/deploy.yml
- name: Create esbuild directories
  run: |
    mkdir -p .esbuild/.serverless
    echo "✓ Created esbuild build directories"
```

### Additional Improvements
1. Document required directory structure in frigg docs
2. Add pre-flight check in frigg deploy to verify required directories
3. Better error message when directory is missing
4. Consider if serverless-esbuild is needed or if serverless-jetpack is sufficient
5. Review if both jetpack and esbuild plugins are needed (they may conflict)

### Priority
Critical - blocks all CI/CD deployments

### References
- serverless-esbuild plugin added by: `packages/devtools/infrastructure/domains/shared/utilities/base-definition-factory.js`
- Deploy command: `packages/frigg-cli/deploy-command/index.js`
- Infrastructure composer: `packages/devtools/infrastructure/infrastructure-composer.js`

---

## Issue 4: Conflicting Serverless Plugins (serverless-esbuild vs serverless-jetpack)

### Problem
The Frigg infrastructure builder adds `serverless-esbuild` to the plugins list, but many Frigg apps also have `serverless-jetpack` in their package.json. These plugins both handle packaging and may conflict.

### Impact
- Unclear which plugin is actually packaging the Lambda functions
- Potential for conflicting configuration
- Extra dependency and build time
- Both plugins do similar jobs (optimize Lambda packages)

### Evidence
From frontify-frigg `backend/package.json`:
```json
{
  "devDependencies": {
    "serverless-esbuild": "^1.55.1",
    "serverless-jetpack": "0.11.2"
  }
}
```

From Frigg infrastructure builder:
```javascript
// base-definition-factory.js adds serverless-esbuild to plugins
plugins: [..., 'serverless-esbuild']
```

### Root Cause
- Historical: Frigg started with jetpack
- Recent: Infrastructure builder now adds esbuild
- No migration guide or automatic detection
- Users have both, creating confusion

### Fix Required

**Option 1: Choose one plugin (recommended)**
Decide on either esbuild or jetpack and:
1. Remove the other from infrastructure builder
2. Document which to use and why
3. Update create-frigg-app templates
4. Provide migration guide

**Option 2: Smart detection**
```javascript
// base-definition-factory.js
function getPackagingPlugin(packageJson) {
    const hasJetpack = packageJson.devDependencies?.['serverless-jetpack'];
    const hasEsbuild = packageJson.devDependencies?.['serverless-esbuild'];

    if (hasJetpack && hasEsbuild) {
        console.warn('Both serverless-jetpack and serverless-esbuild found. Using esbuild.');
    }

    return hasEsbuild ? 'serverless-esbuild' :
           hasJetpack ? 'serverless-jetpack' :
           'serverless-esbuild'; // default
}
```

### Recommendation
- **Use serverless-esbuild** - More modern, better TypeScript support, faster builds
- **Remove serverless-jetpack** - Older plugin, less active development
- **Document the choice** - Explain in migration guide

### Priority
Medium - Works but creates confusion and potential conflicts

### References
- Infrastructure builder: `packages/devtools/infrastructure/domains/shared/utilities/base-definition-factory.js`
- Migration builder: `packages/devtools/infrastructure/domains/database/migration-builder.js`
- Integration builder: `packages/devtools/infrastructure/domains/integration/integration-builder.js`

---

## Issue 5: AWS Discovery Failures Don't Block Deployment (Silent Failures)

### Problem
AWS resource discovery (`packages/devtools/infrastructure/aws-discovery.js`) fails silently when IAM credentials lack permissions, but deployments continue without the discovered resources. This causes confusion and doesn't provide users a way to explicitly opt-out of discovery when using restrictive credentials.

### Impact
- Users with restrictive AWS credentials see discovery errors but deployment continues
- Unclear if discovery failures will cause deployment problems later
- No way to explicitly disable discovery for minimal-permission deployments
- Error messages don't explain what discovery does or why it failed
- Users forced to grant broad permissions or deal with confusing error messages

### Evidence
From frontify-frigg deployment logs:
```
Error discovering AWS resources: User: arn:aws:iam::123456789012:user/github-deploy is not
authorized to perform: ec2:DescribeVpcs on resource: arn:aws:ec2:eu-central-1:123456789012:vpc/*

Warning: AWS discovery failed, continuing with deployment...
```

### Root Cause
From `packages/devtools/infrastructure/CLAUDE.md:101-110`:
```javascript
const shouldRunDiscovery = (AppDefinition) => {
    return (
        AppDefinition.vpc?.enable === true ||
        AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true ||
        AppDefinition.ssm?.enable === true
    );
};
```

Discovery runs automatically when certain features are enabled, but:
1. No way to disable discovery even if user doesn't want it
2. Failures are caught and logged but don't fail deployment
3. Unclear if deployment will work without discovered resources
4. No validation that required permissions exist

### Fix Required

**Option 1: Add explicit discovery toggle (RECOMMENDED)**
```javascript
// AppDefinition schema
const appDefinition = {
    aws: {
        discovery: {
            enabled: true,              // Explicit opt-in/opt-out
            failOnError: false,         // Fail deployment if discovery fails
            requiredResources: []       // Specify what must be discovered
        }
    },
    vpc: {
        enable: true,
        vpcId: 'vpc-12345',            // Manual override if discovery disabled
        subnetIds: ['subnet-1', 'subnet-2'],
        securityGroupIds: ['sg-123']
    }
};
```

**Option 2: Better error handling and documentation**
```javascript
// packages/devtools/infrastructure/aws-discovery.js
async function discoverResources(appDefinition) {
    if (appDefinition.aws?.discovery?.enabled === false) {
        console.log('ℹ️  AWS discovery disabled, using manual configuration');
        return null;
    }

    try {
        const resources = await performDiscovery();
        return resources;
    } catch (error) {
        const message = `
❌ AWS Discovery Failed

The deployment credential doesn't have permissions for resource discovery.

Options:
1. Grant additional IAM permissions (see docs/IAM-POLICY-TEMPLATES.md)
2. Disable discovery and provide resources manually:

   aws: { discovery: { enabled: false } }
   vpc: { vpcId: 'vpc-xxx', subnetIds: [...] }

3. Continue without VPC/KMS features

Error: ${error.message}
        `;

        if (appDefinition.aws?.discovery?.failOnError === true) {
            throw new Error(message);
        } else {
            console.warn(message);
            return null;
        }
    }
}
```

**Option 3: Minimal IAM policy documentation**
```markdown
# docs/IAM-MINIMAL-DEPLOYMENT.md

## Deploying with Minimal AWS Permissions

If your deployment credential has restrictive permissions, you can disable AWS discovery:

```javascript
// appDefinition.js
module.exports = {
    aws: {
        discovery: { enabled: false }
    },
    vpc: {
        enable: false  // Or provide manual configuration
    },
    encryption: {
        useDefaultKMSForFieldLevelEncryption: false
    }
};
```

### Required IAM Permissions (Minimal)
- `cloudformation:*` for stack management
- `lambda:*` for function deployment
- `apigateway:*` for API creation
- `iam:CreateRole`, `iam:AttachRolePolicy` for Lambda execution roles
- `logs:CreateLogGroup`, `logs:PutRetentionPolicy` for CloudWatch

### Optional Permissions (For Discovery)
- `ec2:DescribeVpcs`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`
- `kms:ListKeys`, `kms:DescribeKey`, `kms:ListAliases`
- `ssm:GetParameter`, `ssm:PutParameter`
```

### Current Behavior
Discovery errors are logged as warnings:
```javascript
// packages/devtools/infrastructure/build-time-discovery.js
try {
    const resources = await discovery.findDefaultVpc();
} catch (error) {
    console.warn('AWS discovery failed:', error.message);
    // Deployment continues anyway
}
```

### Additional Improvements
1. Add `--skip-discovery` flag to frigg deploy command
2. Validate that manual configuration is provided when discovery is disabled
3. Document minimal IAM policy for deployment-only (no discovery)
4. Add IAM permission checker that validates before running discovery
5. Better error messages explaining what each discovery step requires

### Priority
Medium - Doesn't block deployments but creates confusion and forces unnecessary permissions

### References
- Discovery logic: `packages/devtools/infrastructure/aws-discovery.js`
- Build-time integration: `packages/devtools/infrastructure/build-time-discovery.js`
- AppDefinition schema: `packages/devtools/infrastructure/CLAUDE.md:24-70`
- IAM policies: `packages/devtools/infrastructure/iam-generator.js`

---

## Summary

These issues stem from incomplete setup and cleanup in Frigg CLI/infrastructure:

1. **osls dependency** - Simple missing dependency declaration (Medium priority)
2. **Prisma layer cleanup** - Missing cleanup logic in build process (High priority)
3. **esbuild directories** - Missing directory creation before deploy (Critical priority)
4. **Plugin conflicts** - Need to choose between esbuild and jetpack (Medium priority)
5. **AWS discovery permissions** - No opt-out for restrictive credentials (Medium priority)

All of these should be fixed in the framework, not worked around in every user's CI/CD pipeline. The workarounds are temporary solutions that every Frigg user will need to implement otherwise.

## Recommended Fix Order

1. **Issue 3 (esbuild directories)** - Blocks all CI/CD, quick fix in serverless plugin
2. **Issue 5 (AWS discovery opt-out)** - Quick config addition, improves UX significantly
3. **Issue 2 (Prisma cleanup)** - Blocks deployments randomly, moderate fix
4. **Issue 1 (osls dependency)** - Easy fix, one line in package.json
5. **Issue 4 (plugin choice)** - Cleanup task, can be done alongside others
