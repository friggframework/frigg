# SSM Parameter Store Usage Guide

## Overview

Frigg provides comprehensive SSM Parameter Store integration with automatic configuration and optimized retrieval using the AWS Parameters and Secrets Lambda Extension.

## Quick Start

### 1. Enable SSM in Your App Definition

```javascript
// app-definition.js
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations
    ],
    ssm: {
        enable: true,
        architecture: 'x86_64'  // or 'arm64' for Graviton
    }
};

module.exports = appDefinition;
```

### 2. Create Parameters in AWS

Use the AWS CLI or Console to create parameters following the naming convention:

```bash
# Create a database URL parameter
aws ssm put-parameter \
    --name "/my-frigg-app/prod/database/url" \
    --value "postgresql://user:pass@host/db" \
    --type "SecureString"

# Create an API key
aws ssm put-parameter \
    --name "/my-frigg-app/prod/api-keys/salesforce" \
    --value "your-api-key" \
    --type "SecureString"

# Create a feature flag
aws ssm put-parameter \
    --name "/my-frigg-app/prod/features/enable-webhooks" \
    --value "true" \
    --type "String"
```

### 3. Use Parameters in Your Handlers

#### Option A: Automatic Loading with Handler Wrapper

```javascript
const { withSSMParameters } = require('@friggframework/devtools/handlers/ssm-handler-wrapper');

const handler = async (event, context) => {
    // All parameters are automatically loaded as environment variables
    // /my-frigg-app/prod/database/url → DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    
    // Your handler logic
    return { statusCode: 200 };
};

// Wrap your handler to auto-load parameters
exports.handler = withSSMParameters(handler, {
    parameterPath: '',      // Load all parameters
    loadSecrets: true,      // Also load from Secrets Manager
    failOnError: true       // Fail if loading fails
});
```

#### Option B: Manual Parameter Loading

```javascript
const ssmParameterStore = require('@friggframework/devtools/utils/ssm-parameter-store');

exports.handler = async (event, context) => {
    // Load specific parameters
    const dbUrl = await ssmParameterStore.getParameter('database/url');
    
    // Load multiple parameters by path
    const apiKeys = await ssmParameterStore.getParametersByPath('api-keys', {
        recursive: true,
        withDecryption: true
    });
    
    // Use the parameters
    console.log('Database URL:', dbUrl);
    console.log('API Keys:', apiKeys);
    
    return { statusCode: 200 };
};
```

#### Option C: Integration with Frigg Handlers

```javascript
const { createHandler } = require('@friggframework/core');
const { withSSMParameters } = require('@friggframework/devtools/handlers/ssm-handler-wrapper');

exports.handler = createHandler({
    eventName: 'My Integration',
    method: withSSMParameters(async (event, context) => {
        // Parameters are already loaded
        const apiKey = process.env.API_KEYS_SALESFORCE;
        
        // Your integration logic
        return { success: true };
    })
});
```

## Parameter Organization Best Practices

### Recommended Structure

```
/${service}/${stage}/
├── database/
│   ├── primary-url         # Primary database connection
│   ├── read-replica-url    # Read replica connection
│   └── connection-pool-size # Connection pool settings
├── api-keys/
│   ├── salesforce/
│   │   ├── client-id       # Salesforce client ID
│   │   └── client-secret   # Salesforce client secret
│   ├── hubspot/
│   │   └── api-key         # HubSpot API key
│   └── slack/
│       └── bot-token       # Slack bot token
├── features/
│   ├── enable-webhooks     # Feature flag for webhooks
│   ├── rate-limit          # Rate limiting threshold
│   └── debug-mode          # Debug mode flag
└── secrets/
    ├── jwt-secret          # JWT signing secret
    └── encryption-key      # Data encryption key
```

### Naming Conventions

- Use lowercase with hyphens for parameter names
- Group related parameters under common paths
- Use descriptive names that indicate the parameter's purpose
- Follow the pattern: `/${service}/${stage}/${category}/${name}`

## Environment Variable Mapping

Parameters are automatically mapped to environment variables:

| SSM Parameter | Environment Variable |
|--------------|---------------------|
| `/my-app/prod/database/url` | `DATABASE_URL` |
| `/my-app/prod/api-keys/salesforce` | `API_KEYS_SALESFORCE` |
| `/my-app/prod/features/enable-webhooks` | `FEATURES_ENABLE_WEBHOOKS` |

## Performance Optimization

### Using the Lambda Extension

The AWS Parameters and Secrets Lambda Extension provides:

- **Caching**: Parameters are cached locally for faster retrieval
- **Reduced API Calls**: Fewer calls to SSM Parameter Store
- **Lower Latency**: ~2x performance improvement
- **Cost Reduction**: Fewer API calls mean lower costs

### Cache Configuration

Control cache behavior with environment variables:

```javascript
// In your app-definition.js or serverless config
environment: {
    SSM_PARAMETER_STORE_TTL: '300',  // Cache for 5 minutes (default)
    PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: '2773'  // Extension port
}
```

## Working with Secrets Manager

The same utility can retrieve secrets from AWS Secrets Manager:

```javascript
const ssmParameterStore = require('@friggframework/devtools/utils/ssm-parameter-store');

// Get a secret
const secret = await ssmParameterStore.getSecret('my-secret-arn');

// If the secret is JSON, it's automatically parsed
console.log(secret.apiKey);
console.log(secret.apiSecret);

// Use with handler wrapper
exports.handler = withSSMParameters(handler, {
    loadSecrets: true,
    secretArn: 'arn:aws:secretsmanager:region:account:secret:name'
});
```

## Error Handling

### Graceful Degradation

```javascript
exports.handler = withSSMParameters(handler, {
    failOnError: false  // Continue even if parameters can't be loaded
});
```

### Manual Error Handling

```javascript
try {
    const param = await ssmParameterStore.getParameter('my-param');
} catch (error) {
    if (error.message.includes('Parameter not found')) {
        // Use default value
        const param = 'default-value';
    } else {
        // Handle other errors
        throw error;
    }
}
```

## Testing

### Local Development

For local testing without AWS:

```javascript
// Set environment variables locally
process.env.DATABASE_URL = 'postgresql://localhost/test';
process.env.API_KEYS_SALESFORCE = 'test-key';

// The parameter store will detect missing AWS_SESSION_TOKEN
// and fall back to environment variables
```

### Unit Testing

```javascript
// Mock the SSM parameter store
jest.mock('@friggframework/devtools/utils/ssm-parameter-store', () => ({
    getParameter: jest.fn().mockResolvedValue('mocked-value'),
    getParametersByPath: jest.fn().mockResolvedValue({
        'param1': 'value1',
        'param2': 'value2'
    }),
    loadAsEnvironmentVariables: jest.fn().mockResolvedValue(2)
}));
```

## Migration from Environment Variables

### Before (using .env files)

```javascript
// Loading from .env file
require('dotenv').config();
const dbUrl = process.env.DATABASE_URL;
```

### After (using SSM)

```javascript
// Automatically loaded from SSM
const { withSSMParameters } = require('@friggframework/devtools/handlers/ssm-handler-wrapper');

exports.handler = withSSMParameters(async (event) => {
    const dbUrl = process.env.DATABASE_URL;  // Same code works!
});
```

## Cost Considerations

### SSM Parameter Store Pricing

- **Standard Parameters**: Free (up to 10,000 parameters)
- **Advanced Parameters**: $0.05 per parameter per month
- **API Calls**: $0.05 per 10,000 API calls

### With Lambda Extension

- **Reduced API Calls**: Extension caches parameters
- **Cost Savings**: Typically 50-80% reduction in API calls
- **Performance**: 2x faster parameter retrieval

## Troubleshooting

### Common Issues

1. **Parameters not loading**
   - Check IAM permissions for `ssm:GetParameter*`
   - Verify parameter names match the prefix
   - Ensure Lambda Extension layer is added

2. **Extension not working**
   - Verify `AWS_SESSION_TOKEN` is available
   - Check extension port (default: 2773)
   - Ensure region-specific layer ARN is correct

3. **Parameter not found**
   - Verify parameter exists: `aws ssm get-parameter --name "/path/to/param"`
   - Check parameter path and prefix
   - Ensure proper IAM permissions

### Debug Mode

Enable debug logging:

```javascript
process.env.SSM_DEBUG = 'true';
const ssmParameterStore = require('@friggframework/devtools/utils/ssm-parameter-store');
```

## Security Best Practices

1. **Use SecureString** for sensitive values
2. **Limit IAM permissions** to specific parameter paths
3. **Rotate secrets regularly** using AWS Secrets Manager
4. **Use different prefixes** for each environment
5. **Enable parameter history** for audit trails
6. **Monitor parameter access** with CloudTrail

## Advanced Usage

### Custom Parameter Prefix

```javascript
// Override the default prefix
process.env.SSM_PARAMETER_PREFIX = '/custom/prefix';
```

### Batch Parameter Updates

```bash
# Update multiple parameters at once
aws ssm put-parameter --name "/my-app/prod/param1" --value "value1" --overwrite &
aws ssm put-parameter --name "/my-app/prod/param2" --value "value2" --overwrite &
aws ssm put-parameter --name "/my-app/prod/param3" --value "value3" --overwrite &
wait
```

### Parameter Policies

```bash
# Set parameter expiration
aws ssm put-parameter \
    --name "/my-app/prod/temp-token" \
    --value "token-value" \
    --policies '[{
        "Type": "Expiration",
        "Version": "1.0",
        "Attributes": {
            "Timestamp": "2024-12-31T23:59:59.000Z"
        }
    }]'
```

## Related Documentation

- [SSM Configuration Reference](../reference/ssm-configuration.md)
- [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html)
- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)