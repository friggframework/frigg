# VPC Configuration

## Overview

Frigg provides **complete VPC infrastructure automation** for your Lambda functions. When enabled, it creates a production-ready VPC with all necessary components: VPC, subnets, NAT Gateway, Internet Gateway, route tables, security groups, and VPC endpoints.

## Quick Start - Zero Configuration

Enable VPC with a single flag - Frigg handles everything:

```javascript
const appDefinition = {
    name: 'my-frigg-app',
    integrations: [
        // your integrations...
    ],
    vpc: {
        enable: true  // That's it! Complete VPC infrastructure is created automatically
    }
}

module.exports = appDefinition;
```

## What Gets Created Automatically

When `vpc.enable` is `true`, Frigg creates a complete, production-ready VPC infrastructure:

### Core VPC Infrastructure
- **VPC** with DNS resolution enabled (`10.0.0.0/16` CIDR)
- **Internet Gateway** for internet connectivity
- **Public Subnet** for NAT Gateway (`10.0.1.0/24`)
- **2 Private Subnets** in different AZs for Lambda functions (`10.0.2.0/24`, `10.0.3.0/24`)
- **NAT Gateway** with Elastic IP for private subnet internet access
- **Route Tables** properly configured for internet routing

### Security Groups
- **Lambda Security Group** with outbound rules for:
  - HTTPS (443) - API calls
  - HTTP (80) - HTTP requests  
  - DNS (53 TCP/UDP) - Domain resolution

### VPC Endpoints (Cost Optimization)
- **S3 Gateway Endpoint** (free) - Direct S3 access without NAT costs
- **DynamoDB Gateway Endpoint** (free) - Direct DynamoDB access
- **KMS Interface Endpoint** (paid, ~$22/month) - Only if KMS encryption enabled
- **Secrets Manager Interface Endpoint** (paid, ~$22/month) - For secure secret access

### IAM Permissions
- **ENI Management** permissions for Lambda VPC operations

## Configuration Options

### Basic VPC (Zero Configuration)
```javascript
vpc: {
    enable: true  // Creates complete VPC infrastructure with defaults
}
```

### Custom CIDR Block
```javascript
vpc: {
    enable: true,
    cidrBlock: '10.1.0.0/16'  // Custom VPC CIDR (default: 10.0.0.0/16)
}
```

### Disable VPC Endpoints
```javascript
vpc: {
    enable: true,
    enableVPCEndpoints: false  // Disable VPC endpoints (use NAT for all traffic)
}
```

### Use Existing Infrastructure
```javascript
vpc: {
    enable: true,
    securityGroupIds: ['sg-existing123'],  // Use existing security groups
    subnetIds: ['subnet-existing456']      // Use existing subnets
    // Skips infrastructure creation, only enables VPC for Lambda
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

### Override Existing Infrastructure
```javascript
// Use your existing VPC resources instead of auto-created ones
vpc: {
    enable: true,
    securityGroupIds: ['sg-your-existing'],
    subnetIds: ['subnet-your-existing-1', 'subnet-your-existing-2']
}
```


### Production-Optimized Setup
```javascript
const appDefinition = {
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    vpc: {
        enable: true,
        cidrBlock: '10.0.0.0/16',
        enableVPCEndpoints: true  // Include KMS endpoint for encryption
    }
};
```

### Existing Infrastructure Integration
```javascript
const appDefinition = {
    vpc: {
        enable: true,
        securityGroupIds: ['sg-prod-lambda-12345'],
        subnetIds: ['subnet-prod-private-1', 'subnet-prod-private-2']
    }
};
``` 