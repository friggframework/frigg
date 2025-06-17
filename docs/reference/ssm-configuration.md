# SSM Parameter Store Configuration

## Overview

Frigg provides **automatic SSM Parameter Store integration** for secure configuration management. When enabled, it configures AWS Systems Manager Parameter Store access for your Lambda functions, allowing you to store and retrieve configuration values, secrets, and other sensitive data.

## Quick Start

Enable SSM Parameter Store with a single flag:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations...
    ],
    ssm: {
        enable: true  // Enables SSM Parameter Store access
    }
}

module.exports = appDefinition;
```

## What Gets Configured Automatically

When `ssm.enable` is `true`, Frigg automatically:

1. **Adds Lambda Extension Layer**: Includes AWS Parameters and Secrets Lambda Extension for optimized parameter retrieval
2. **Grants SSM Permissions**: Adds parameter read permissions scoped to your application
3. **Sets Environment Variables**: Configures parameter prefix for organized parameter storage
4. **VPC Integration**: Creates SSM VPC Endpoint when VPC is enabled for secure access

### Generated Infrastructure

The framework generates the following serverless configuration:

```yaml
# Lambda Layer (for performance optimization)
provider:
  layers:
    - arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11

# IAM Permissions (scoped to your application)
provider:
  iamRoleStatements:
    - Effect: Allow
      Action:
        - ssm:GetParameter
        - ssm:GetParameters  
        - ssm:GetParametersByPath
      Resource:
        - arn:aws:ssm:${self:provider.region}:*:parameter/${self:service}/${self:provider.stage}/*

# Environment Variables
provider:
  environment:
    SSM_PARAMETER_PREFIX: /${self:service}/${self:provider.stage}
```

## Using SSM Parameters in Your Code

### Accessing Parameters via Environment Variable

The parameter prefix is available in your Lambda functions:

```javascript
const parameterPrefix = process.env.SSM_PARAMETER_PREFIX;
// Example: "/my-frigg-app/prod"

// Parameter naming convention:
// /${service}/${stage}/parameter-name
// Example: "/my-frigg-app/prod/database-url"
```

### Using AWS Parameters and Secrets Extension

The Lambda extension provides optimized parameter retrieval:

```javascript
// Using HTTP calls to the extension (recommended)
const http = require('http');

async function getParameter(parameterName) {
    const options = {
        hostname: 'localhost',
        port: 2773,
        path: `/systemsmanager/parameters/get?name=${parameterName}`,
        method: 'GET',
        headers: {
            'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN
        }
    };
    
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const response = JSON.parse(data);
                resolve(response.Parameter.Value);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Usage
const databaseUrl = await getParameter(`${process.env.SSM_PARAMETER_PREFIX}/database-url`);
```

### Using AWS SDK (Alternative)

```javascript
const { SSMClient, GetParameterCommand, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

// Get single parameter
async function getParameter(name) {
    const command = new GetParameterCommand({
        Name: `${process.env.SSM_PARAMETER_PREFIX}/${name}`,
        WithDecryption: true
    });
    
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
}

// Get multiple parameters by path
async function getAllParameters() {
    const command = new GetParametersByPathCommand({
        Path: process.env.SSM_PARAMETER_PREFIX,
        Recursive: true,
        WithDecryption: true
    });
    
    const response = await ssmClient.send(command);
    return response.Parameters;
}
```

## Parameter Organization

### Recommended Parameter Structure

Frigg automatically creates a parameter hierarchy for your application:

```
/${service-name}/${stage}/
├── database-url          # Database connection strings
├── api-keys/
│   ├── salesforce-key   # Integration API keys
│   ├── hubspot-key
│   └── slack-token
├── features/
│   ├── enable-webhooks  # Feature flags
│   └── rate-limit
└── secrets/
    ├── jwt-secret       # Application secrets
    └── webhook-secret
```

### Parameter Types

```javascript
// String parameters (default)
await putParameter('/my-app/prod/database-url', 'mongodb://...');

// SecureString parameters (encrypted)
await putParameter('/my-app/prod/secrets/api-key', 'secret-value', 'SecureString');

// StringList parameters
await putParameter('/my-app/prod/allowed-domains', 'domain1.com,domain2.com', 'StringList');
```

## VPC Integration

### SSM with VPC Enabled

When both SSM and VPC are enabled, Frigg optimizes for security and performance:

```javascript
const appDefinition = {
    ssm: { enable: true },
    vpc: { enable: true },
    integrations: [/* your integrations */]
};
```

This configuration automatically:
- **Creates SSM VPC Endpoint** (~$22/month) for secure parameter access
- **Avoids NAT Gateway costs** for parameter operations  
- **Reduces latency** by keeping SSM traffic within your VPC
- **Improves security** by avoiding internet routing for parameter retrieval

### Cost Considerations

| Configuration | Monthly Cost | Security | Performance |
|---------------|--------------|----------|-------------|
| SSM only (no VPC) | $0 | Medium | Good |
| SSM + VPC (no endpoints) | ~$45 | High | Good |
| SSM + VPC + Endpoints | ~$67 | Very High | Excellent |

## Configuration Options

### Basic SSM (Default)
```javascript
ssm: {
    enable: true  // Uses default configuration
}
```

### Custom Parameter Prefix
```javascript
ssm: {
    enable: true,
    parameterPrefix: '/custom-prefix'  // Override default prefix
}
```

### Environment-Specific Configuration
```javascript
ssm: {
    enable: process.env.STAGE !== 'local',  // Disable for local development
    parameterPrefix: `/${appName}/${process.env.STAGE}`
}
```

## Security Best Practices

### When to Use SSM Parameter Store

Enable SSM Parameter Store for:
- **Configuration values** that vary by environment
- **API keys and tokens** for third-party services
- **Database connection strings** and credentials
- **Feature flags** and runtime configuration
- **Sensitive application settings**

### Parameter Security

- **Use SecureString** for sensitive values (encrypted with KMS)
- **Scope IAM permissions** to specific parameter paths
- **Enable parameter history** tracking for audit trails
- **Use parameter policies** for automatic expiration
- **Implement parameter rotation** for credentials

### Parameter Naming Conventions

```javascript
// ✅ Good: Clear hierarchy and naming
/${service}/${stage}/database/primary-url
/${service}/${stage}/api-keys/salesforce/client-id
/${service}/${stage}/features/enable-async-processing

// ❌ Avoid: Flat structure and unclear names
/${service}/${stage}/db-url
/${service}/${stage}/sf-key  
/${service}/${stage}/flag1
```

## Examples

### Complete Configuration Setup

```javascript
// app-definition.js
const appDefinition = {
    name: 'integration-platform',
    integrations: [
        SalesforceIntegration,
        HubspotIntegration
    ],
    ssm: { enable: true },
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    vpc: { enable: true }
};

module.exports = appDefinition;
```

### Runtime Parameter Usage

```javascript
// Lambda function using parameters
exports.handler = async (event) => {
    // Get configuration from SSM
    const databaseUrl = await getParameter('database/primary-url');
    const salesforceKey = await getParameter('api-keys/salesforce/client-id');
    const enableWebhooks = await getParameter('features/enable-webhooks');
    
    // Use parameters in your integration logic
    const database = new Database(databaseUrl);
    const salesforce = new SalesforceAPI(salesforceKey);
    
    if (enableWebhooks === 'true') {
        // Feature flag enabled
        await setupWebhooks();
    }
    
    return { statusCode: 200 };
};
```

## Deployment Considerations

### Parameter Creation

Parameters should be created during deployment or manually:

```bash
# Create parameters using AWS CLI
aws ssm put-parameter \
    --name "/my-app/prod/database-url" \
    --value "mongodb://prod-cluster.example.com" \
    --type "SecureString"

aws ssm put-parameter \
    --name "/my-app/prod/api-keys/salesforce/client-id" \
    --value "your-salesforce-client-id" \
    --type "SecureString"
```

### Environment Isolation

Parameters are environment-specific by default:
- **Development**: `/my-app/dev/*`
- **Staging**: `/my-app/staging/*`  
- **Production**: `/my-app/prod/*`

### Version Requirements

- **Framework Version**: Requires `@friggframework/devtools` v2.1.0+
- **AWS Region**: Available in all AWS regions
- **Lambda Runtime**: Compatible with Node.js 16.x, 18.x, 20.x
- **Extension Version**: Uses AWS Parameters and Secrets Lambda Extension v11