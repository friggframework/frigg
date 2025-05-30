# Encryption and Security

## Overview

Frigg provides built-in support for data encryption to help you secure sensitive information in your integrations. The framework automatically configures AWS KMS (Key Management Service) for field-level encryption when enabled in your application definition.

## Default Encryption: AES Keys

### Out-of-the-Box Encryption

By default, Frigg uses a simple AES key-based encryption system that works without any additional configuration. This system uses environment variables to manage encryption keys:

```javascript
// Current encryption key
process.env.AES_KEY_ID       // Key identifier
process.env.AES_KEY          // Actual encryption key

// For key rotation support
process.env.DEPRECATED_AES_KEY_ID    // Previous key identifier  
process.env.DEPRECATED_AES_KEY       // Previous encryption key
```


## Automatic KMS Configuration

### Enable KMS in Your App Definition

To enable automatic KMS configuration, add the `encryption` property to your App Definition:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations...
    ],
    encryption: {
        useDefaultKMSForFieldLevelEncryption: true
    }
}

module.exports = appDefinition;
```

### What Happens Automatically

When `useDefaultKMSForFieldLevelEncryption` is set to `true`, Frigg automatically:

1. **Grants KMS Permissions**: Adds `kms:GenerateDataKey` and `kms:Decrypt` permissions to all Lambda function IAM roles
2. **Sets Environment Variable**: Configures `KMS_KEY_ARN` environment variable for runtime access
3. **Includes KMS Plugin**: Adds the `serverless-kms-grants` plugin to your serverless configuration
4. **Configures Default Keys**: Uses AWS default KMS keys (`kmsKeyId: '*'`) for encryption operations

### Generated Infrastructure

The framework generates the following serverless configuration:

```yaml
# IAM Permissions
provider:
  iamRoleStatements:
    - Effect: Allow
      Action:
        - kms:GenerateDataKey
        - kms:Decrypt
      Resource: 
        - '${self:custom.kmsGrants.kmsKeyId}'

# Environment Variables
provider:
  environment:
    KMS_KEY_ARN: '${self:custom.kmsGrants.kmsKeyId}'

# Plugins
plugins:
  - serverless-kms-grants

# Custom Configuration
custom:
  kmsGrants:
    kmsKeyId: '*'
```

## Using KMS in Your Code

### Accessing the KMS Key ARN

The KMS key ARN is available in your Lambda functions via environment variables:

```javascript
const kmsKeyArn = process.env.KMS_KEY_ARN;

// Use with AWS SDK for encryption operations
const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');

const kmsClient = new KMSClient({ region: 'us-east-1' });
```

### Integration with Frigg Encrypt Module

If you're using the `@friggframework/encrypt` module, it will automatically use the configured KMS key:

```javascript
const { encrypt, decrypt } = require('@friggframework/encrypt');

// Encrypt sensitive data
const encryptedData = await encrypt(sensitiveString);

// Decrypt when needed
const decryptedData = await decrypt(encryptedData);
```

## Security Best Practices

### When to Use KMS

Enable KMS encryption when your integrations handle:

- Personal Identifiable Information (PII)
- Financial data
- Authentication tokens (beyond basic OAuth)
- Sensitive business data
- Healthcare information (PHI)

### Key Management

- **Default Keys**: Frigg uses AWS default KMS keys (`*`) for simplicity
- **Custom Keys**: For enhanced security, consider creating dedicated KMS keys per environment
- **Key Rotation**: AWS automatically rotates default keys annually

## Deployment Considerations

### Prerequisites

Ensure your deployment environment has:

1. **IAM Permissions**: Deployment role needs KMS permissions to create grants
2. **KMS Access**: Lambda execution role will have KMS permissions after deployment

### Environment Isolation

KMS configurations are environment-specific:

- **Development**: Uses same default keys for testing
- **Staging**: Can use environment-specific keys
- **Production**: Should use dedicated production keys for maximum security

### Version Requirements

- **Framework Version**: Requires `@friggframework/devtools` v2.1.0+
- **AWS Provider**: Compatible with all AWS regions
- **Node.js**: Works with all supported Node.js versions (16.x, 18.x, 20.x)

## Examples

### Basic Setup

```javascript
// app-definition.js
const appDefinition = {
    name: 'secure-integration-app',
    integrations: [
        SalesforceIntegration
        HubspotIntegration
    ],
    encryption: {
        useDefaultKMSForFieldLevelEncryption: true
    }
};

module.exports = appDefinition;
```