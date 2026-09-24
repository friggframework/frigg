# AWS SDK v3 & OSS-Serverless Migration Guide

## Overview

The Frigg framework has been migrated from Serverless Framework v3 to OSS-Serverless with complete AWS SDK v2 → v3 modernization. This guide covers what changed and how to work with the new code.

## What Changed

### 1. Serverless Framework → OSS-Serverless

**Why**: Serverless Framework v4 introduced breaking changes and licensing restrictions. OSS-Serverless is a maintained, MIT-licensed v3 alternative.

**Migration**:
```bash
# Old
npm install serverless@3.39.0

# New
npm install osls@^3.40.1

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
- Update `package.json` engines: `"node": ">=22"`
- Update serverless runtime: `runtime: nodejs22.x`

### 4. Bundle Optimization

**Old**: serverless-jetpack (~220MB bundles)
**New**: serverless-esbuild (~45-60MB bundles, 73% reduction)

### 5. Prisma Layer Optimization

**Old**: Single layer with CLI + runtime (~100MB)
**New**: Minimal runtime layer (~10-15MB) + separate dbMigrate function with CLI

### 6. DDD/Hexagonal Architecture

**Old**: Monolithic 2,800-line serverless-template.js
**New**: Domain-separated modules (~505 lines template + focused domain builders)

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
npx osls --version  # Should show 3.40.1+
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

- [ ] Update `package.json` to use `osls` instead of `serverless`
- [ ] Install dependencies: `npm install`
- [ ] Update any custom deployment scripts to use `osls`
- [ ] Rebuild Prisma layer: `rm -rf layers/prisma && osls deploy`
- [ ] Test deployment in dev environment
- [ ] Verify function sizes in Lambda console
- [ ] Test database migrations
- [ ] Update CI/CD pipelines to use `osls`

## References

- [OSS-Serverless GitHub](https://github.com/oss-serverless/serverless)
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

