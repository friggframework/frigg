# VPC Configuration

## Overview

Frigg provides **VPC networking support** for your Lambda functions with two main approaches:

1. **AWS Discovery** (Default): Automatically finds and uses your existing VPC infrastructure
2. **Infrastructure Creation**: Creates new VPC infrastructure when explicitly requested with `createNew: true`

When VPC is enabled, Lambda functions gain enhanced security through network isolation. The AWS Discovery approach leverages your existing VPC setup, while infrastructure creation is available for cases where you need dedicated networking resources.

## Quick Start - AWS Discovery (Default)

The default approach automatically discovers and uses your existing VPC infrastructure:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations...
    ],
    vpc: {
        enable: true  // Default: Uses AWS Discovery to find existing VPC resources
    }
}

module.exports = appDefinition;
```

**This is the recommended approach** because:
- ✅ **Zero infrastructure costs** - uses existing resources
- ✅ **Fast deployment** - no resource creation delays  
- ✅ **Integrates seamlessly** with existing network setup
- ✅ **Production ready** - leverages proven infrastructure
- ✅ **No CIDR conflicts** - works with any existing VPC CIDR ranges

## AWS Discovery Mode (Default)

When using AWS Discovery, Frigg automatically finds your existing VPC resources:

### What Gets Discovered
- **Default VPC** or first available VPC in your account
- **Private Subnets** with proper routing for Lambda functions
- **Security Groups** suitable for Lambda outbound traffic
- **Route Tables** that support internet access
- **Default KMS Key** for encryption operations

### What Gets Created for Lambda Internet Access
Even with existing VPC, Lambda functions need guaranteed internet access for external API calls:

- **NAT Gateway** with Elastic IP (~$45/month) - required for outbound HTTPS to Salesforce, HubSpot, etc.
- **Route Table** with NAT Gateway routing for Lambda subnets
- **Subnet Route Associations** to ensure Lambda traffic uses NAT Gateway
- **Lambda Security Group** with outbound rules for:
  - HTTPS (443) - API calls
  - HTTP (80) - HTTP requests  
  - DNS (53 TCP/UDP) - Domain resolution
- **VPC Endpoints** (optional, cost optimization):
  - S3 Gateway Endpoint (free)
  - DynamoDB Gateway Endpoint (free)
  - KMS Interface Endpoint (~$22/month, if KMS enabled)

### IAM Permissions
- **ENI Management** permissions for Lambda VPC operations

## Infrastructure Creation Mode

For new VPC infrastructure, add `createNew: true`:

### Complete VPC Infrastructure Created
- **VPC** with DNS resolution enabled (configurable CIDR)
- **Internet Gateway** for internet connectivity
- **Public Subnet** for NAT Gateway
- **2 Private Subnets** in different AZs for Lambda functions
- **NAT Gateway** with Elastic IP for private subnet internet access
- **Route Tables** properly configured for internet routing
- **Security Groups** for Lambda and VPC endpoints

## Configuration Options

### Basic VPC with AWS Discovery (Default)
```javascript
vpc: {
    enable: true  // Default: Uses AWS Discovery to find existing VPC resources
}
```

### Explicit Resource IDs (Override Discovery)
```javascript
vpc: {
    enable: true,
    securityGroupIds: ['sg-existing123'],  // Use specific security groups
    subnetIds: ['subnet-existing456', 'subnet-existing789']  // Use specific subnets
}
```

### Create New VPC Infrastructure (Explicit Opt-in)
```javascript
vpc: {
    enable: true,
    createNew: true,  // Explicit opt-in: Creates complete new VPC infrastructure
    cidrBlock: '10.1.0.0/16'  // Custom VPC CIDR (default: 10.0.0.0/16)
}
```

### Disable VPC Endpoints (Cost Optimization)
```javascript
vpc: {
    enable: true,
    enableVPCEndpoints: false  // Disable VPC endpoints, use NAT for all traffic
}
```

### Environment-Specific Configuration
```javascript
vpc: {
    enable: process.env.STAGE === 'prod',  // Only enable VPC in production
    createNew: process.env.STAGE === 'dev',  // Create new VPC for dev environments
    cidrBlock: process.env.VPC_CIDR || '10.0.0.0/16'
}
```

## Generated Infrastructure

### Complete CloudFormation Resources
```yaml
# VPC and Networking
- AWS::EC2::VPC (10.0.0.0/16)
- AWS::EC2::InternetGateway
- AWS::EC2::NatGateway + Elastic IP
- AWS::EC2::Subnet (1 public, 2 private)
- AWS::EC2::RouteTable (public + private routing)

# Security
- AWS::EC2::SecurityGroup (Lambda + VPC Endpoints)

# VPC Endpoints (optional)
- AWS::EC2::VPCEndpoint (S3, DynamoDB - free)
- AWS::EC2::VPCEndpoint (KMS, Secrets Manager - paid)

# Lambda Configuration
provider:
  vpc:
    securityGroupIds: [!Ref FriggLambdaSecurityGroup]
    subnetIds: 
      - !Ref FriggPrivateSubnet1
      - !Ref FriggPrivateSubnet2
```

### Cost Optimization
```javascript
// Minimal cost setup
vpc: {
    enable: true,
    enableVPCEndpoints: false  // Use NAT only, skip interface endpoints
}

// Optimized setup (recommended)
vpc: {
    enable: true  // Default: includes free S3/DynamoDB endpoints
}
```

### Environment-Specific VPC
```javascript
const appDefinition = {
    vpc: {
        enable: process.env.STAGE === 'prod',  // Only enable VPC in production
        cidrBlock: process.env.STAGE === 'prod' ? '10.0.0.0/16' : '10.1.0.0/16'
    }
};
```

## When to Use VPC

### ✅ Enable VPC For:
- **Production applications** requiring network isolation
- **Compliance requirements** (SOC 2, HIPAA, PCI DSS)
- **Integration with existing VPC resources**
- **Enhanced security posture**
- **Cost optimization** via VPC endpoints

## Migration and Compatibility

### Existing Applications
- **Zero breaking changes** - add `vpc: { enable: true }` when ready
- **Gradual rollout** - enable per environment
- **Rollback friendly** - disable flag to revert

### Advanced: AWS Discovery with KMS and SSM
```javascript
const appDefinition = {
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    ssm: { enable: true },
    vpc: {
        enable: true,
        enableVPCEndpoints: true  // Include KMS and SSM endpoints
    }
};
```

### Production Setup: Explicit Resources
```javascript
const appDefinition = {
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    vpc: {
        enable: true,
        securityGroupIds: ['sg-prod-lambda-12345'],
        subnetIds: ['subnet-prod-private-1', 'subnet-prod-private-2']
    }
};
``` 