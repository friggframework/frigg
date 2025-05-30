# VPC Configuration

## Overview

Frigg can automatically configure VPC (Virtual Private Cloud) for your Lambda functions to provide network isolation and security. This feature enables zero-touch VPC configuration for developers who need enhanced security controls.

## Enable VPC for Lambda Functions

Add the `vpc` property to your App Definition:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        HubspotIntegration,
        SalesforceIntegration
    ],
    vpc: {
        enable: true
    }
}

module.exports = appDefinition;
```

## VPC Configuration Options

### Basic VPC Enable
```javascript
vpc: {
    enable: true  // Uses existing serverless config or requires manual setup
}
```

### VPC with Custom Security Groups
```javascript
vpc: {
    enable: true,
    securityGroupIds: ['sg-custom123']  // Custom security groups
    // subnetIds will use serverless config values
}
```

### VPC with Full Custom Configuration
```javascript
vpc: {
    enable: true,
    securityGroupIds: ['sg-custom123'],
    subnetIds: ['subnet-abc123', 'subnet-def456']
}
```

## What Happens Automatically

When `vpc.enable` is set to `true`, Frigg automatically:

1. **Configures VPC Settings**: Adds VPC configuration to all Lambda functions
2. **Override Support**: App Definition values override any existing serverless VPC configuration  
3. **Grants VPC Permissions**: Adds necessary IAM permissions for VPC operations

## When to Use VPC

**Enable VPC for:**
- Applications requiring network isolation
- Compliance requirements (SOC 2, HIPAA, PCI DSS)
- Integration with private AWS resources
- Enhanced security controls
- Custom networking requirements

**Consider Alternatives for:**
- Simple applications with minimal security requirements
- Cost-sensitive applications (VPC can increase costs)
- Applications that need maximum cold start performance

## Stage-Specific Considerations

The framework provides warnings and flexibility for different environments:

```javascript
// Environment-specific VPC configuration
const appDefinition = {
    integrations: [...],
    vpc: {
        enable: process.env.STAGE !== 'prod'  // Disable VPC in production
    }
};
```

**Development/Staging**: VPC useful for testing network isolation  
**Production**: Consider if VPC complexity is necessary for your use case

## VPC Override Pattern

App Definition generates basic VPC config, which can be overridden by stage-specific patterns in your serverless.yml:

```javascript
// App Definition provides base VPC config
vpc: {
    enable: true,
    securityGroupIds: ['sg-default123'],  // Default config
    subnetIds: ['subnet-default456']      // Default config
}
```

### Custom VPC Configuration
```javascript
const appDefinition = {
    integrations: [SalesforceIntegration],
    vpc: {
        enable: true,
        securityGroupIds: ['sg-12345678'],
        subnetIds: ['subnet-12345678', 'subnet-87654321']
    }
};
```

### Environment-Specific VPC
```javascript
const appDefinition = {
    integrations: [SalesforceIntegration],
    vpc: {
        enable: ['dev', 'staging'].includes(process.env.STAGE)
    }
};
``` 