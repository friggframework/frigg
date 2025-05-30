# VPC Configuration

## Overview

Frigg can automatically configure VPC (Virtual Private Cloud) for your Lambda functions to provide network isolation and security. This feature enables zero-touch VPC configuration for developers who need enhanced security controls.

## Enable VPC for Lambda Functions

Add the `vpc` property to your App Definition:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations...
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

## Generated VPC Infrastructure

The framework generates stage-specific VPC configuration following the Frigg standard pattern:

```yaml
# Lambda VPC Configuration (stage-specific pattern)
provider:
  vpc: ${self:custom.vpc.${self:provider.stage}}

# Stage-specific VPC settings
custom:
  vpc:
    dev:
      securityGroupIds: ['sg-custom123']  # From App Definition
      subnetIds: ['subnet-abc123', 'subnet-def456']  # From App Definition
    prod:
      securityGroupIds: ['sg-prod456']
      subnetIds: ['subnet-prod789']

# VPC IAM Permissions
provider:
  iamRoleStatements:
    - Effect: Allow
      Action:
        - ec2:CreateNetworkInterface
        - ec2:DescribeNetworkInterfaces
        - ec2:DeleteNetworkInterface
        - ec2:AttachNetworkInterface
        - ec2:DetachNetworkInterface
      Resource: '*'
```

**Example manual VPC endpoint configuration:**
```yaml
# In your serverless.yml
resources:
  Resources:
    S3VPCEndpoint:
      Type: AWS::EC2::VPCEndpoint
      Properties:
        VpcId: vpc-12345678
        ServiceName: com.amazonaws.${self:provider.region}.s3
        VpcEndpointType: Gateway
```

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

App Definition values work with the stage-specific VPC pattern:

```yaml
# In serverless.yml
custom:
  vpc:
    dev:
      securityGroupIds: ['sg-serverless123']
      subnetIds: ['subnet-serverless456']
    prod: "Disabled"  # String to disable VPC in production
```

```javascript
// App Definition enhances stage-specific config
vpc: {
    enable: true,
    securityGroupIds: ['sg-app123']  // Added to stage-specific config
    subnetIds: ['subnet-app456']     // Added to stage-specific config
}
```

The generated configuration follows Frigg's stage-specific pattern:
```yaml
provider:
  vpc: ${self:custom.vpc.${self:provider.stage}}

custom:
  vpc:
    ${self:provider.stage}:
      securityGroupIds: ['sg-app123']    # From App Definition
      subnetIds: ['subnet-app456']       # From App Definition
```

## VPC Setup Requirements

Before enabling VPC in your App Definition, ensure you have:

1. **VPC Resources**: VPC, subnets, and security groups created
2. **Internet Access**: NAT Gateway or VPC endpoints for Lambda internet access
3. **Security Groups**: Proper outbound rules for your Lambda functions
4. **Subnet Configuration**: Private subnets recommended for Lambda functions

## Troubleshooting VPC Issues

### Lambda Timeout in VPC
- Ensure subnets have internet access via NAT Gateway
- VPC endpoints reduce need for internet access
- Check security group rules allow outbound traffic

### Missing VPC Resources
```
InvalidParameterValueException: The subnet ID 'subnet-xxx' does not exist
```
*Solution*: Verify subnet IDs exist and are in the correct region/account

### ENI Limit Reached
```
ENILimitReachedException: The function could not provision an ENI
```
*Solution*: Request ENI limit increase or use fewer concurrent executions

### VPC Configuration Errors
```
InvalidParameterValueException: The provided execution role does not have permissions
```
*Solution*: Frigg automatically adds VPC permissions - ensure latest devtools version

## Migration and Compatibility

### Existing Applications
- Add `vpc: { enable: true }` when ready for network isolation
- No breaking changes to existing functionality  
- Can be enabled/disabled per environment

### Serverless Config Integration
- Works alongside existing serverless VPC configuration
- App Definition values take precedence
- Maintains backward compatibility

### Best Practices
1. **Start Simple**: Use basic `enable: true` first
2. **Test Thoroughly**: VPC can affect function behavior
3. **Monitor Costs**: VPC can increase AWS costs
4. **Plan Networking**: Ensure proper subnet and security group setup
5. **Consider Alternatives**: Evaluate if VPC is truly necessary

## Examples

### Basic VPC Setup
```javascript
// Requires existing VPC resources in serverless.yml
const appDefinition = {
    integrations: [SalesforceIntegration, HubspotIntegration],
    vpc: {
        enable: true
    }
};
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