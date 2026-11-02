# AWS SDK v3 & OSS-Serverless Migration Guide

## Overview

The Frigg framework has been migrated from Serverless Framework v3 to OSS-Serverless with complete AWS SDK v2 → v3 modernization. This guide covers what changed and how to work with the new code.

## What Changed

### 1. Serverless Framework → OSS-Serverless

**Why**: Serverless Framework v4 introduced breaking changes and licensing restrictions. OSS-Serverless is a maintained, MIT-licensed v3 alternative.

Frigg 2.0.1 and later target **osls 4** (`^4.4.0`). See [osls 4 (Frigg 2.0.1)](#osls-4-frigg-201) below and
[ADR-050](../architecture-decisions/050-osls-4.md).

**Migration**:
```bash
# Old
npm install serverless@3.39.0

# New (Frigg 2.0.1+)
npm install osls@^4.4.0

# Commands remain the same
osls deploy --stage dev     # was: serverless deploy
osls package --stage dev    # was: serverless package
```

### 2. AWS SDK v2 → v3

**Why**: AWS SDK v3 offers modular imports, smaller bundle sizes, and better tree-shaking.

**Migration Pattern**:
```javascript
// OLD (v2)
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
const result = await sqs.sendMessage(params).promise();

// NEW (v3)
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});
const result = await sqs.send(new SendMessageCommand(params));
```

### 3. Node.js 18 → 22

**Why**: Node.js 22 is the latest Lambda runtime with better performance.

**Migration**:
- Lambda runtime: `runtime: nodejs22.x` (unchanged by osls 4)
- CLI host (where `frigg` / `osls` run): Node `^22.13.0 || >=24`. This is the
  `engines.node` of `@friggframework/devtools` and `@friggframework/frigg-cli`.
  osls 3.7x and osls 4 both refuse Node 23 and Node 22.0–22.12, and the Frigg
  CLI now says so before it starts (`FRIGG_SKIP_NODE_VERSION_CHECK=true` bypasses
  the CLI check, but osls itself still refuses).

### 4. Bundle Optimization

**Old**: serverless-jetpack (~220MB bundles)
**New**: serverless-esbuild (~45-60MB bundles, 73% reduction)

### 5. Prisma Layer Optimization

**Old**: Single layer with CLI + runtime (~100MB)
**New**: Minimal runtime layer (~10-15MB) + separate dbMigrate function with CLI

### 6. DDD/Hexagonal Architecture

**Old**: Monolithic 2,800-line serverless-template.js
**New**: Domain-separated modules (~505 lines template + focused domain builders)

## osls 4 (Frigg 2.0.1)

Frigg 2.0.1 moves from osls 3 to osls `^4.4.0` ([ADR-050](../architecture-decisions/050-osls-4.md)).
osls 3 depends on the end-of-support AWS SDK v2, so every Frigg app installed it through
its deploy tool; osls 4 uses SDK v3 internally and is the line that gets new features
(SSO credentials, `AWS_ENDPOINT_URL`, `provider.pruneFunctionVersions`).

### What Frigg now emits

| Setting | Before (osls 3) | Now |
|---|---|---|
| Function packaging | `package.include` / `package.exclude` | `package.patterns`: the excludes negated first, then the includes (`[!exclude…, include…]`). Same file set: osls evaluates this list in the order it built from include/exclude. |
| `useDotenv` | `false` for build/deploy, `true` for `offline` | `true` for `frigg start` (offline) only; the key is omitted otherwise |
| `frameworkVersion` | `>=3.17.0` (or `>=3.58.0` with LoggingConfig) | `^4.4.0` from one constant (`OSLS_FRAMEWORK_VERSION`) |
| `osls` dependency | `^3.58.0` | `^4.4.0` (devtools devDependency, frigg-cli dependency) |
| `provider.iamRoleStatements` | unchanged | unchanged. osls 4 prints a deprecation warning; the move to `provider.iam.role.statements` is tracked for osls 5 |

`custom.esbuild.exclude` is a serverless-esbuild option, not osls packaging, and is unchanged.

### Upgrading an app to 2.0.1

osls 4 fails on configuration it only warned about before. Check your `infrastructure.js`
wrapper and plugins for each of these:

| If your app… | Fix |
|---|---|
| adds `package.include` / `package.exclude` (service, function or layer) | Use `package.patterns`. Put excludes first with a `!` prefix, then includes: `patterns: ['!node_modules/big-lib/**', 'certs/ca.pem']`. On osls 4 the old keys are rejected; with validation set to `warn` they are silently ignored and the function ships its whole `node_modules` closure. |
| sets `useDotenv: false` | Remove the key. Absent means "do not load `.env`". |
| pins `frameworkVersion: '3'` or `^3.x` | Use `^4.4.0` (or remove your override; Frigg sets it). |
| has its own `osls` 3 dependency | Remove it or move it to `^4.4.0`. `frigg` spawns the `osls` it resolves; a 3.x binary fails with `FRAMEWORK_VERSION_MISMATCH`. |
| sets service-level `package.patterns` | They now come *before* each function's own patterns, so Frigg's function excludes win. On osls 3 service patterns could re-add files a function excluded. Move a re-include to the function's `package.patterns`. |
| loads a plugin that calls `provider.request`, `provider.sdk` or `provider.getCredentials` | Upgrade the plugin, or load a shim such as `osls-aws-provider-request-shim`. |
| runs the CLI on Node 23 or Node 22.0–22.12 | Use Node 22.13+ or Node 24+. |

### Operator notes (credentials and AWS requests)

osls 4 resolves credentials and calls AWS with SDK v3 semantics:

- **Profiles:** `~/.aws/config` is always merged. A profile that has static keys in
  `~/.aws/credentials` *and* a `role_arn` in `~/.aws/config` now assumes the role, so the
  deploy can land in a **different account**. Check the identity before the first deploy
  (`aws sts get-caller-identity --profile <p>`).
- **MFA:** `mfa_serial` is honoured and prompts for a code. The prompt fails in CI; use a
  role or session credentials there.
- **SSO:** IAM Identity Center profiles work.
- **STS:** calls go to the regional endpoint.
- **`AWS_ENDPOINT_URL`** (and `AWS_ENDPOINT_URL_<SERVICE>`) is honoured. This makes moto and
  LocalStack builds work without plugin wiring, but a value left in your shell sends a real
  `frigg deploy` to the local endpoint. Unset it before deploying.
- **S3-compatible targets:** SDK v3 sends CRC32 checksums. Set
  `AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED` if a non-AWS S3 rejects them.
- **Errors and retries:** SDK v3 retry behaviour and error codes apply. The Frigg CLI does
  not parse osls error codes.

### Package size budget

Measured with `osls package --stage prod` against moto, a scaffold app and a featured app
(integration + webhook + queue worker + migrations + admin scripts), Prisma layer on:

| Function | Zipped | Unzipped | Budget (unzipped) |
|---|---|---|---|
| `auth`, `user`, `health`, integration (`<name>`, `<name>Webhook`, `<name>QueueWorker`), `dlqProcessor`, `adminScriptExecutor`, `adminScriptRouter` | 9.3 MB | 31.4 MB | 100 MB |
| `dbMigrationRouter` | 4.1 MB | 13.6 MB | 100 MB |
| `dbMigrationWorker` | 4.2 MB | 13.9 MB | 100 MB |
| `prisma` layer | 14.6–22.7 MB | 37.2–56.3 MB | 100 MB |

osls 3.78.0 and osls 4.4.0 produced the same file lists and sizes. The hard limit is
Lambda's 250 MB unzipped for a function **plus its layers**; the largest measured total
(function + Prisma layer) is about 88 MB. Keep each function under **100 MB unzipped** and
function + layers under **200 MB**, which leaves 50 MB of headroom. A function well above
these numbers usually means its packaging lost the `node_modules` excludes (for example an
app-supplied `package.include`/`exclude` that osls 4 ignores) or dev dependencies were not
excluded.

To check a build:

```bash
frigg build --stage prod
for z in .serverless/*.zip; do
  printf '%-40s %8s zipped %8s unzipped\n' "$z" \
    "$(du -h "$z" | cut -f1)" \
    "$(unzip -l "$z" | tail -1 | awk '{printf "%.1fM", $1/1048576}')"
done
```

osls excludes dev dependencies by running `npm ls --dev` and `npm ls --prod`. npm 9+
masks UUID-shaped path segments in that output as `***`, so in a project path that contains
a UUID (some CI workspaces and temp directories) the exclusion silently matches nothing and
every function ships the whole dev tree (about 195 MB unzipped in the featured app). Build
from a path without a UUID segment.

### Rollback

`package.patterns` and the `useDotenv` change are valid on osls 3, so rolling back is a pin
change: `osls` back to `^3.78.0` and `frameworkVersion` to a range that accepts 3.x. A
blocked app can add `"overrides": { "osls": "3.78.0" }` and set `frameworkVersion` in its
`infrastructure.js` wrapper. Deployed stacks need no rollback: templates and resource names
are unchanged.

## Files Modified

### Runtime Code (AWS SDK v3 Migration)
1. `packages/core/queues/queuer-util.js` - SQS operations
2. `packages/core/encrypt/Cryptor.js` - KMS encryption
3. `packages/core/logs/logger.js` - Removed AWS logger
4. `packages/core/core/Worker.js` - SQS queue workers
5. `packages/core/websocket/repositories/*.js` (3 files) - API Gateway Management
6. `packages/core/database/models/WebsocketConnection.js` - API Gateway Management
7. `packages/devtools/management-ui/server/utils/environment/awsParameterStore.js` - SSM

### Configuration Files
8. `packages/devtools/package.json` - Dependencies updated
9. `packages/core/package.json` - AWS SDK v3 added
10. `packages/devtools/infrastructure/esbuild.config.js` - NEW
11. `packages/devtools/infrastructure/serverless-template.js` - Reduced 82%

### Domain Architecture (NEW)
12-21. Domain builders in `packages/devtools/infrastructure/domains/`

## AWS SDK v3 Migration Patterns

### SQS Operations

```javascript
// v2
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
await sqs.sendMessage({ QueueUrl, MessageBody }).promise();

// v3
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const client = new SQSClient({});
await client.send(new SendMessageCommand({ QueueUrl, MessageBody }));
```

### KMS Operations

```javascript
// v2
const kms = new AWS.KMS();
const data = await kms.generateDataKey({ KeyId, KeySpec }).promise();

// v3
const { KMSClient, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const client = new KMSClient({});
const data = await client.send(new GenerateDataKeyCommand({ KeyId, KeySpec }));
```

### API Gateway Management

```javascript
// v2
const apigw = new AWS.ApiGatewayManagementApi({ endpoint });
await apigw.postToConnection({ ConnectionId, Data }).promise();

// v3
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = 
    require('@aws-sdk/client-apigatewaymanagementapi');
const client = new ApiGatewayManagementApiClient({ endpoint });
await client.send(new PostToConnectionCommand({ ConnectionId, Data }));
```

### SSM Parameter Store

```javascript
// v2
const ssm = new AWS.SSM();
await ssm.getParametersByPath(params).promise();

// v3
const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
const client = new SSMClient({});
await client.send(new GetParametersByPathCommand(params));
```

### Error Handling

```javascript
// v2
if (error.statusCode === 410) { ... }

// v3 (two formats)
if (error.statusCode === 410 || error.$metadata?.httpStatusCode === 410) { ... }
```

## Testing with AWS SDK v3

### Setup
```javascript
const { mockClient } = require('aws-sdk-client-mock');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

describe('My Test', () => {
    let sqsMock;

    beforeEach(() => {
        sqsMock = mockClient(SQSClient);
    });

    afterEach(() => {
        sqsMock.reset();
    });

    it('should call SQS', async () => {
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'test-id' });
        
        // Your code that calls SQS
        const result = await myFunction();

        expect(sqsMock.calls()).toHaveLength(1);
    });
});
```

## Deployment Guide

### Installing Dependencies

```bash
# Install new dependencies
npm install

# Verify osls is available
npx osls --version  # Should show 4.4.0+ (Frigg 2.0.1+)
```

### Building Prisma Layer

```bash
# Automatic (during deploy)
osls deploy --stage dev

# Manual
node node_modules/@friggframework/devtools/infrastructure/scripts/build-prisma-layer.js
```

### Running Migrations

```bash
# Deploy first
osls deploy --stage dev

# Run migrations
aws lambda invoke \
  --function-name <your-stack>-dev-dbMigrate \
  --payload '{"command":"deploy"}' \
  response.json
```

### Local Development

```bash
# Start local server (offline mode)
osls offline --stage dev

# Or use Frigg CLI
frigg start
```

## Troubleshooting

### Issue: Module not found @aws-sdk/client-sqs

**Solution**: Install dependencies
```bash
cd packages/core
npm install
```

### Issue: Prisma layer too large

**Solution**: Verify layer build excludes CLI
```bash
ls -lah layers/prisma/nodejs/node_modules/
# Should NOT have prisma/build directory
# Should be ~10-15MB total
```

### Issue: Tests failing with AWS SDK mocks

**Solution**: Use aws-sdk-client-mock
```bash
npm install --save-dev aws-sdk-client-mock aws-sdk-client-mock-jest
```

### Issue: serverless command not found

**Solution**: Use osls
```bash
# Old
serverless deploy

# New
osls deploy
```

## Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lambda Bundle | ~220MB | ~45-60MB | 73% smaller |
| Prisma Layer | ~100MB | ~10-15MB | 85% smaller |
| Cold Start | Baseline | 20-30% faster | From smaller bundles |
| serverless-template.js | 2,800 lines | 505 lines | 82% reduction |

## Domain Architecture

The new architecture separates infrastructure concerns:

```
domains/
├── shared/          - Cross-cutting concerns
│   ├── base-builder.js
│   ├── builder-orchestrator.js
│   ├── resource-discovery.js
│   └── environment-builder.js
├── networking/      - VPC, subnets, security groups
│   └── vpc-builder.js
├── security/        - KMS encryption
│   └── kms-builder.js
├── database/        - Aurora PostgreSQL
│   └── aurora-builder.js
├── parameters/      - SSM Parameter Store
│   └── ssm-builder.js
└── integration/     - WebSockets, integrations
    ├── websocket-builder.js
    └── integration-builder.js
```

**Benefits**:
- Each domain is independently testable
- Clear dependency relationships
- Easy to extend with new infrastructure types
- Follows SOLID principles

## Migration Checklist

When updating existing Frigg applications:

- [ ] Update `package.json` to use `osls` (`^4.4.0` for Frigg 2.0.1+) instead of `serverless`
- [ ] Run the CLI on Node `^22.13.0 || >=24`
- [ ] Replace any `package.include`/`exclude` in `infrastructure.js` with `package.patterns`; remove `useDotenv: false` and any `frameworkVersion` 3.x pin
- [ ] Install dependencies: `npm install`
- [ ] Update any custom deployment scripts to use `osls`
- [ ] Rebuild Prisma layer: `rm -rf layers/prisma && osls deploy`
- [ ] Test deployment in dev environment
- [ ] Verify function sizes in Lambda console
- [ ] Test database migrations
- [ ] Update CI/CD pipelines to use `osls`

## References

- [OSS-Serverless GitHub](https://github.com/oss-serverless/osls)
- [osls: Upgrading to v4](https://github.com/oss-serverless/osls/blob/main/docs/guides/upgrading-to-v4.md)
- [ADR-050: Move to osls 4 for 2.0.1](../architecture-decisions/050-osls-4.md)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [AWS SDK v3 Migration Guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrating-to-v3.html)
- [serverless-esbuild Plugin](https://github.com/floydspace/serverless-esbuild)
- [Prisma Lambda Deployment](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-lambda)

## Support

For issues or questions:
1. Check test files for usage examples
2. Review domain builders for infrastructure patterns
3. Consult `IMPLEMENTATION-COMPLETE.md` for complete details
4. See `OSS-SERVERLESS-NEXT-STEPS.md` for deployment guide

