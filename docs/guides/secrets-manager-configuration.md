# Secrets Manager Configuration

## Overview

Frigg automatically configures AWS Secrets Manager for secure storage and retrieval of sensitive data like API keys, passwords, and tokens. When enabled (default), it creates a dedicated Secrets Manager secret and configures Lambda functions to automatically load secrets as environment variables.

## Quick Start

### 1. Default Configuration (Automatic)

Secrets Manager is **enabled by default**. No configuration needed:

```javascript
// app-definition.js
module.exports = {
    name: 'my-app',
    integrations: [
        // your integrations
    ]
    // Secrets Manager is automatically enabled!
};
```

This automatically:
- Creates a Secrets Manager secret named `my-app-secrets-{stage}`
- Sets `SECRET_ARN` environment variable
- Configures IAM permissions
- Loads secrets as environment variables via `secretsToEnv()`

### 2. Disable Secrets Manager

To disable (not recommended):

```javascript
module.exports = {
    name: 'my-app',
    secrets: {
        enable: false  // Explicitly disable
    }
};
```

## How It Works

### Automatic Infrastructure

When Secrets Manager is enabled, Frigg creates:

```yaml
# CloudFormation resource created automatically
FriggAppSecrets:
  Type: AWS::SecretsManager::Secret
  Properties:
    Name: ${service}-secrets-${stage}
    Description: Secrets for application

# Environment variable set automatically
SECRET_ARN: !Ref FriggAppSecrets

# IAM permissions added automatically
- Effect: Allow
  Action: secretsmanager:GetSecretValue
  Resource: !Ref FriggAppSecrets
```

### Automatic Loading in Handlers

The `createHandler` function automatically calls `secretsToEnv()`:

```javascript
const { createHandler } = require('@friggframework/core');

exports.handler = createHandler({
    eventName: 'My Handler',
    method: async (event, context) => {
        // Secrets are already loaded as environment variables!
        console.log(process.env.API_KEY);         // From Secrets Manager
        console.log(process.env.DATABASE_PASSWORD); // From Secrets Manager
        
        return { success: true };
    }
});
```

## Managing Secrets

### Add Secrets via AWS Console

1. Go to AWS Secrets Manager in the AWS Console
2. Find your secret: `{app-name}-secrets-{stage}`
3. Click "Retrieve secret value"
4. Click "Edit"
5. Add your key-value pairs:
   ```json
   {
       "API_KEY": "sk-1234567890",
       "DATABASE_PASSWORD": "super-secret-password",
       "JWT_SECRET": "jwt-signing-secret",
       "STRIPE_KEY": "sk_live_..."
   }
   ```
6. Save

### Add Secrets via AWS CLI

```bash
# Create or update the entire secret
aws secretsmanager put-secret-value \
    --secret-id "my-app-secrets-prod" \
    --secret-string '{
        "API_KEY": "sk-1234567890",
        "DATABASE_PASSWORD": "super-secret-password",
        "JWT_SECRET": "jwt-signing-secret",
        "STRIPE_KEY": "sk_live_..."
    }'

# Or update specific values using jq
aws secretsmanager get-secret-value \
    --secret-id "my-app-secrets-prod" \
    --query SecretString \
    --output text | \
    jq '.API_KEY = "new-api-key"' | \
    aws secretsmanager put-secret-value \
        --secret-id "my-app-secrets-prod" \
        --secret-string file:///dev/stdin
```

### Add Secrets Programmatically

```javascript
const { SecretsManagerClient, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function updateSecrets() {
    const secrets = {
        API_KEY: process.env.NEW_API_KEY,
        DATABASE_PASSWORD: process.env.NEW_DB_PASSWORD,
        // ... other secrets
    };
    
    const command = new PutSecretValueCommand({
        SecretId: 'my-app-secrets-prod',
        SecretString: JSON.stringify(secrets)
    });
    
    await client.send(command);
}
```

## Secret Rotation

### Automatic Rotation

Configure automatic rotation for database passwords:

```javascript
// In your serverless template or CloudFormation
definition.resources.Resources.FriggAppSecrets = {
    Type: 'AWS::SecretsManager::Secret',
    Properties: {
        Name: '${self:service}-secrets-${self:provider.stage}',
        SecretString: JSON.stringify({ /* ... */ }),
        // Enable automatic rotation
        RotationRules: {
            AutomaticallyAfterDays: 30
        }
    }
};

// Add rotation Lambda
definition.resources.Resources.SecretRotationLambda = {
    Type: 'AWS::SecretsManager::RotationSchedule',
    Properties: {
        SecretId: { Ref: 'FriggAppSecrets' },
        RotationLambdaARN: { /* Your rotation Lambda ARN */ },
        RotationRules: {
            AutomaticallyAfterDays: 30
        }
    }
};
```

### Manual Rotation

```bash
# Rotate a secret manually
aws secretsmanager rotate-secret \
    --secret-id "my-app-secrets-prod" \
    --rotation-lambda-arn "arn:aws:lambda:..."
```

## Secrets vs SSM Parameters

### When to Use Secrets Manager

Use Secrets Manager for:
- **Passwords** and database credentials
- **API keys** that need rotation
- **OAuth tokens** and refresh tokens
- **Private keys** and certificates
- **Any data requiring automatic rotation**

### When to Use SSM Parameter Store

Use SSM Parameter Store for:
- **Configuration values** that change occasionally
- **Feature flags** and settings
- **Non-sensitive URLs** and endpoints
- **Application settings** that don't need rotation

### Using Both Together

```javascript
// app-definition.js
module.exports = {
    name: 'my-app',
    secrets: {
        enable: true  // For sensitive rotating secrets
    },
    ssm: {
        enable: true  // For configuration values
    }
};
```

Your handlers will automatically load both:

```javascript
exports.handler = createHandler({
    method: async () => {
        // From Secrets Manager
        const apiKey = process.env.API_KEY;
        
        // From SSM Parameter Store
        const featureEnabled = process.env.FEATURE_WEBHOOKS_ENABLED;
        
        return { success: true };
    }
});
```

## Performance Optimization

### Lambda Extension Caching

The AWS Parameters and Secrets Lambda Extension provides:
- **In-memory caching** of secrets
- **Reduced API calls** to Secrets Manager
- **Lower latency** (2x faster)
- **Cost reduction** (fewer API calls)

### Cache Configuration

```javascript
// Control cache TTL (default: 300 seconds)
process.env.SECRETS_MANAGER_TTL = '600';  // 10 minutes

// Extension port (default: 2773)
process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = '2773';
```

## Cost Considerations

### Secrets Manager Pricing

- **Storage**: $0.40 per secret per month
- **API Calls**: $0.05 per 10,000 API calls
- **Rotation**: No additional charge for rotation

### Cost Optimization Tips

1. **Use the Lambda Extension** - Reduces API calls by 50-80%
2. **Share secrets across functions** - One secret for all related functions
3. **Use SSM for non-sensitive config** - Free for standard parameters
4. **Set appropriate cache TTL** - Balance freshness vs cost

### Example Cost Calculation

For an application with:
- 1 secret with 10 key-value pairs
- 100 Lambda invocations per minute
- 5-minute cache TTL

Monthly cost:
- Storage: $0.40
- API calls (with caching): ~$0.15
- **Total: ~$0.55/month**

Without caching: ~$2.50/month

## Security Best Practices

### 1. Use Least Privilege

```javascript
// Only grant access to specific secrets
{
    Effect: 'Allow',
    Action: 'secretsmanager:GetSecretValue',
    Resource: 'arn:aws:secretsmanager:region:account:secret:my-app-*'
}
```

### 2. Enable Secret Versioning

Secrets Manager automatically versions all changes:

```bash
# View secret history
aws secretsmanager describe-secret \
    --secret-id "my-app-secrets-prod"

# Get specific version
aws secretsmanager get-secret-value \
    --secret-id "my-app-secrets-prod" \
    --version-id "abc123..."
```

### 3. Use KMS Encryption

```javascript
// Enable KMS encryption for secrets
definition.resources.Resources.FriggAppSecrets = {
    Type: 'AWS::SecretsManager::Secret',
    Properties: {
        KmsKeyId: { Ref: 'FriggKMSKey' },
        // ... other properties
    }
};
```

### 4. Monitor Secret Access

Enable CloudTrail logging to track secret access:

```bash
# View secret access logs
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=ResourceName,AttributeValue=my-app-secrets-prod
```

### 5. Implement Secret Rotation

Regular rotation reduces the impact of compromised credentials.

## Troubleshooting

### Secret Not Loading

**Check SECRET_ARN is set:**
```javascript
console.log('SECRET_ARN:', process.env.SECRET_ARN);
```

**Verify IAM permissions:**
```bash
aws secretsmanager get-secret-value \
    --secret-id "my-app-secrets-prod" \
    --profile your-lambda-role
```

**Check Lambda Extension:**
```javascript
const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
console.log('Extension port:', port);
console.log('Session token:', !!process.env.AWS_SESSION_TOKEN);
```

### Secret Values Not in Environment

**Verify secret structure is JSON:**
```bash
aws secretsmanager get-secret-value \
    --secret-id "my-app-secrets-prod" \
    --query SecretString \
    --output text | jq '.'
```

**Check secretsToEnv() is called:**
```javascript
// This should be automatic with createHandler
// But you can call it manually:
const { secretsToEnv } = require('@friggframework/core/core/secrets-to-env');
await secretsToEnv();
```

### Performance Issues

**Enable caching:**
Make sure the Lambda Extension layer is added (automatic with Frigg).

**Increase cache TTL:**
```javascript
process.env.SECRETS_MANAGER_TTL = '900';  // 15 minutes
```

## Migration Guide

### From Environment Variables

**Before (.env file):**
```
API_KEY=sk-1234567890
DATABASE_PASSWORD=secret
```

**After (Secrets Manager):**
1. Add secrets to Secrets Manager
2. Remove .env file
3. No code changes needed!

### From Hardcoded Values

**Before:**
```javascript
const apiKey = 'sk-1234567890';  // DON'T DO THIS!
```

**After:**
```javascript
const apiKey = process.env.API_KEY;  // Loaded from Secrets Manager
```

## Related Documentation

- [SSM Parameter Store Configuration](../reference/ssm-configuration.md)
- [SSM Parameter Usage Guide](./ssm-parameter-usage.md)
- [Architecture Detection](./ssm-architecture-detection.md)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html)