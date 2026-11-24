# CLAUDE.md - Frigg Infrastructure as Code

This file provides guidance to Claude Code when working with the Frigg Framework's infrastructure system in `packages/devtools/infrastructure/`.

## Critical Context (Read First)

- **Package Purpose**: Infrastructure-as-code templates and AWS resource discovery for Frigg serverless applications
- **Core Architecture**: AWS-native infrastructure with CloudFormation, serverless framework integration, automatic resource discovery
- **Key Components**: Serverless template generator, AWS resource discovery, IAM policy generator, deployment automation
- **Security Model**: VPC deployment, KMS encryption, IAM least-privilege, SSM Parameter Store integration
- **Deployment Phases**: Phase 1-2 (basic), Phase 3 (enhanced monitoring, CDN, CI/CD pipelines)  
- **DO NOT**: Hardcode AWS resource IDs, bypass security configurations, create infrastructure outside CloudFormation

## Infrastructure System Architecture

### Core Infrastructure Generator (`serverless-template.js:1-50940`)

**Purpose**: Generates complete serverless.yml configurations with AWS resource discovery integration

**Key Responsibilities**:
- **Template Generation**: Creates serverless framework configuration from app definition
- **Resource Discovery Integration**: Automatically discovers and configures AWS resources
- **Environment Variable Management**: Handles reserved AWS variables and user-defined variables
- **Module Discovery**: Finds and integrates Node.js modules and dependencies
- **VPC Configuration**: Configures Lambda functions for private subnet deployment
- **KMS Integration**: Sets up field-level encryption with customer-managed keys

**App Definition Structure**:
```javascript
const AppDefinition = {
    name: 'my-frigg-app',
    provider: 'aws',
    
    // VPC Configuration
    vpc: {
        enable: true,                    // Enable VPC deployment
        createNew: false,               // Use existing VPC (default)
        securityGroupIds: [...],        // Optional custom security groups
        subnetIds: [...],              // Optional custom subnets
        enableVPCEndpoints: true       // Create VPC endpoints for AWS services
    },
    
    // Encryption Configuration  
    encryption: {
        useDefaultKMSForFieldLevelEncryption: true
    },
    
    // SSM Parameter Store
    ssm: {
        enable: true
    },
    
    // Environment Variables (serverless-template.js:24-79)
    environment: {
        MY_VAR: true,                   // Creates ${env:MY_VAR, ''} reference
        AWS_REGION: true               // Skipped - reserved AWS variable
    },
    
    // WebSocket Support (Phase 3)
    websockets: {
        enable: true
    },
    
    // Integration Definitions
    integrations: [
        { Definition: { name: 'hubspot' } },
        { Definition: { name: 'salesforce' } }
    ]
};
```

### AWS Resource Discovery (`aws-discovery.js:27-550`)

**Purpose**: Automatically discovers existing AWS resources for serverless deployment

**Discovery Capabilities**:
- **VPC Discovery**: Find default VPC and associated resources
- **Subnet Discovery**: Identify private subnets for Lambda deployment
- **Security Group Discovery**: Locate default security groups
- **KMS Key Discovery**: Find customer-managed KMS keys for encryption
- **Route Table Discovery**: Map route tables for VPC endpoints
- **Account Information**: Get AWS account ID and region details

**Core Discovery Methods**:
```javascript
const discovery = new AWSDiscovery('us-east-1');

// VPC and Networking
const vpcId = await discovery.findDefaultVpc();
const subnets = await discovery.findPrivateSubnets(vpcId);
const securityGroups = await discovery.findDefaultSecurityGroup(vpcId);
const routeTables = await discovery.findRouteTables(vpcId);

// Encryption
const kmsKey = await discovery.findDefaultKMSKey();

// Account Information
const accountId = await discovery.getAccountId();
```

**Resource Discovery Triggers** (`serverless-template.js:10-17`):
```javascript
const shouldRunDiscovery = (AppDefinition) => {
    return (
        AppDefinition.vpc?.enable === true ||                                    // VPC deployment
        AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true || // KMS encryption
        AppDefinition.ssm?.enable === true                                       // SSM parameters
    );
};
```

### IAM Policy Generator (`iam-generator.js:12-885`)

**Purpose**: Generate least-privilege IAM policies based on app definition features

**Policy Generation Modes**:
- **Auto Mode**: Detects features from app definition and generates appropriate policies
- **Basic Mode**: Minimal permissions for simple deployments  
- **Full Mode**: Complete permissions for all features

**Feature-Based Policy Generation**:
```javascript
const features = {
    vpc: appDefinition.vpc?.enable === true,                    // EC2 VPC permissions
    kms: appDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true, // KMS permissions  
    ssm: appDefinition.ssm?.enable === true,                   // SSM Parameter Store permissions
    websockets: appDefinition.websockets?.enable === true      // API Gateway WebSocket permissions
};
```

**Generated IAM Resources**:
- **Deployment User**: IAM user for CI/CD deployments
- **Lambda Execution Roles**: Roles for Lambda function execution
- **CloudFormation Roles**: Roles for infrastructure stack management
- **Service-Specific Policies**: Tailored policies for each AWS service used

### Build-Time Discovery (`build-time-discovery.js:1-300`)

**Purpose**: Integration between AWS discovery and serverless deployment process

**Integration Points**:
- **Pre-Build Hook**: Runs discovery before serverless deployment
- **Environment Injection**: Sets discovered resources as environment variables
- **Template Variables**: Replaces placeholders in serverless templates
- **Error Handling**: Graceful fallbacks when discovery fails

**Environment Variable Injection**:
```bash
# Automatically set by build-time discovery
AWS_DISCOVERY_VPC_ID=vpc-12345678
AWS_DISCOVERY_SECURITY_GROUP_ID=sg-12345678  
AWS_DISCOVERY_SUBNET_ID_1=subnet-12345678
AWS_DISCOVERY_SUBNET_ID_2=subnet-87654321
AWS_DISCOVERY_ROUTE_TABLE_ID=rtb-12345678
AWS_DISCOVERY_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
```

## Phase 3 Infrastructure Components

### Enhanced Monitoring (`cloudformation/monitoring-infrastructure.yaml`)

**Advanced CloudWatch Configuration**:
- **Custom Dashboards**: Multi-service monitoring dashboards
- **Composite Alarms**: System health monitoring with multiple metrics
- **Code Generation Monitoring**: AI/ML service performance tracking
- **UI Distribution Monitoring**: CDN and S3 performance metrics
- **Cross-Stack Dependencies**: Monitoring across infrastructure stacks

### CDN Infrastructure (`cloudformation/cdn-infrastructure.yaml`)

**CloudFront Distribution System**:
- **S3 Origin**: Multi-framework UI package storage
- **Custom Domains**: Route 53 integration for branded URLs
- **Lambda@Edge**: Package deployment automation
- **API Gateway Integration**: RESTful package management API
- **Cache Optimization**: Intelligent caching for UI assets

### Code Generation Infrastructure (`cloudformation/codegen-infrastructure.yaml`)

**AI/ML-Powered Code Generation Platform**:
- **SQS Queue System**: Asynchronous generation request processing
- **Lambda Functions**: AI/ML integration for code generation
- **DynamoDB Tracking**: Generation request and status tracking
- **S3 Template Storage**: Version-controlled template repository
- **ElastiCache**: Template and generated code caching

### Advanced Alerting (`cloudformation/alerting-infrastructure.yaml`)

**Multi-Channel Alerting System**:
- **SNS Topics**: Severity-based alert routing (critical, warning, info)
- **Lambda Processing**: Alert enrichment and routing logic
- **PagerDuty Integration**: On-call escalation for critical issues
- **Slack Integration**: Team collaboration and alert management
- **Composite Health Checks**: System-wide health monitoring

### CI/CD Pipeline (`cloudformation/deployment-pipeline.yaml`)

**Automated Deployment Pipeline**:
- **CodePipeline**: Multi-stage deployment workflow
- **CodeBuild Projects**: Separate build processes for backend and UI
- **GitHub Integration**: Source code management and webhooks
- **Multi-Environment**: Development, staging, production environments
- **Approval Gates**: Manual approval for production deployments

## Infrastructure Configuration Patterns

### VPC-Enabled Deployment
```javascript
const vpcConfig = {
    vpc: {
        enable: true,
        createNew: false,          // Use existing default VPC
        enableVPCEndpoints: true   // Create endpoints for AWS services
    }
};

// Results in Lambda functions deployed in private subnets
// with VPC endpoints for S3, DynamoDB, SQS, SNS, etc.
```

### KMS Encryption Setup
```javascript
const encryptionConfig = {
    encryption: {
        useDefaultKMSForFieldLevelEncryption: true
    }
};

// Automatically discovers customer-managed KMS key
// Sets up Lambda environment variables for encryption
// Configures IAM permissions for KMS operations
```

### SSM Parameter Store Integration
```javascript
const ssmConfig = {
    ssm: {
        enable: true
    }
};

// Creates SSM parameters for configuration management
// Sets up IAM permissions for parameter access
// Enables secure configuration without hardcoding
```

### WebSocket Configuration (Phase 3)
```javascript
const websocketConfig = {
    websockets: {
        enable: true
    }
};

// Creates API Gateway WebSocket API
// Sets up connection management Lambda functions
// Configures route handlers for WebSocket messages
```

## Security Architecture

### IAM Permission Structure

**Lambda Execution Permissions**:
- **VPC Access**: ENI creation/deletion for VPC deployment
- **Encryption**: KMS key usage for field-level encryption
- **Storage**: S3 bucket operations for file handling
- **Queues**: SQS send/receive for background job processing
- **Parameters**: SSM parameter read access for configuration
- **Logging**: CloudWatch Logs creation and writing

**Deployment Permissions**:
- **CloudFormation**: Stack create/update/delete operations
- **IAM**: Role and policy management (limited scope)
- **Lambda**: Function management and configuration
- **API Gateway**: API creation and configuration
- **Resource Discovery**: Read-only access for resource discovery

### Network Security Model

**Private Subnet Deployment**:
```javascript
// Lambda functions deployed in private subnets
// No direct internet access - uses NAT Gateway or VPC endpoints
{
    vpc: { enable: true },
    // Automatically configures:
    // - Private subnet placement
    // - Security group associations  
    // - VPC endpoints for AWS services
}
```

**VPC Endpoint Strategy**:
- **S3 Gateway Endpoint**: Cost-effective S3 access
- **Interface Endpoints**: SQS, SNS, DynamoDB, KMS, SSM
- **DNS Resolution**: Private DNS for AWS services
- **Security Groups**: Restricted access to required ports/protocols

### Encryption Implementation

**Field-Level Encryption**:
```javascript
// Automatic KMS integration
{
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    // Results in:
    // - KMS key discovery and configuration
    // - Lambda environment variables for encryption
    // - IAM permissions for KMS operations
    // - Automatic encrypt/decrypt in data layer
}
```

**Data at Rest**:
- **S3 Buckets**: SSE-S3 or SSE-KMS encryption
- **DynamoDB**: Encryption at rest with KMS
- **SQS Queues**: Server-side encryption
- **Lambda Environment**: Encrypted environment variables

## Deployment Automation

### Infrastructure Deployment Process

**Discovery and Template Generation**:
```bash
# 1. AWS resource discovery
node aws-discovery.js --region us-east-1

# 2. Serverless template generation  
node serverless-template.js --app-definition ./app-definition.js

# 3. IAM policy generation
node iam-generator.js --mode auto --app-definition ./app-definition.js

# 4. CloudFormation deployment
serverless deploy --stage production
```

**Environment Variable Management**:
```javascript
// Reserved AWS variables automatically skipped
const reservedVars = [
    '_HANDLER', '_X_AMZN_TRACE_ID', 'AWS_DEFAULT_REGION',
    'AWS_EXECUTION_ENV', 'AWS_REGION', 'AWS_LAMBDA_FUNCTION_NAME',
    'AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'AWS_LAMBDA_FUNCTION_VERSION',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'
];

// User variables converted to serverless references
{ MY_VAR: true } → { MY_VAR: "${env:MY_VAR, ''}" }
```

### Testing Strategy

**Infrastructure Validation Tests** (`integration.test.js:1-450`):
- **Template Generation**: Validate generated serverless.yml syntax
- **Resource Discovery**: Test AWS API integration with mock data
- **IAM Policy**: Validate policy syntax and permissions
- **Cross-Stack Dependencies**: Test Phase 3 stack interactions
- **CloudFormation Limits**: Validate template size and resource counts

**Mock Data Patterns**:
```javascript
const mockAWSResources = {
    defaultVpcId: 'vpc-12345678',
    defaultSecurityGroupId: 'sg-12345678', 
    privateSubnetId1: 'subnet-private-1',
    privateSubnetId2: 'subnet-private-2',
    defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    routeTableId: 'rtb-12345678'
};
```

## Performance Optimization

### Lambda Cold Start Optimization
- **Provisioned Concurrency**: Configure for critical functions
- **VPC Optimization**: Use VPC endpoints to reduce ENI creation time
- **Layer Strategy**: Share common dependencies via Lambda layers
- **Function Sizing**: Right-size memory allocation for performance/cost

### Cost Optimization Strategies
- **VPC Endpoints**: Reduce NAT Gateway data transfer costs
- **S3 Intelligent Tiering**: Automatic storage class optimization  
- **CloudWatch Log Retention**: Configure appropriate retention periods
- **Reserved Capacity**: Use reserved concurrency for predictable workloads

### Infrastructure Scaling
- **Auto Scaling**: Configure Lambda concurrency limits
- **DynamoDB**: On-demand billing for variable workloads
- **SQS**: Use appropriate queue types (standard vs FIFO)
- **CloudFront**: Global edge locations for UI distribution

## Anti-Patterns to Avoid

❌ **Don't hardcode AWS resource IDs** - use discovery system for dynamic configuration  
❌ **Don't bypass VPC security** - always deploy Lambda functions in private subnets when VPC enabled  
❌ **Don't create infrastructure manually** - use CloudFormation templates for consistency  
❌ **Don't ignore IAM least privilege** - use generated policies based on actual feature usage  
❌ **Don't skip resource discovery** - discovery ensures compatibility with existing infrastructure  
❌ **Don't expose secrets in templates** - use SSM Parameter Store or Secrets Manager  
❌ **Don't ignore CloudFormation limits** - validate template size and resource counts

## Troubleshooting Common Issues

### AWS Discovery Failures
```bash
# Check AWS credentials and region
aws sts get-caller-identity
echo $AWS_REGION

# Test specific discovery functions
node -e "
  const { AWSDiscovery } = require('./aws-discovery');
  const discovery = new AWSDiscovery('us-east-1');
  discovery.findDefaultVpc().then(console.log).catch(console.error);
"
```

### Serverless Deployment Issues
```bash
# Enable debug logging for serverless
SLS_DEBUG=true serverless deploy

# Validate generated template
serverless print > template.yml

# Check CloudFormation template syntax
aws cloudformation validate-template --template-body file://template.yml
```

### VPC Configuration Problems
- **ENI Limits**: Check elastic network interface limits in target subnets
- **Security Groups**: Ensure security groups allow required traffic
- **Route Tables**: Verify routing for VPC endpoints and NAT Gateway
- **DNS Resolution**: Check VPC DNS settings for private DNS names

### KMS Encryption Issues
- **Key Permissions**: Ensure IAM roles have KMS usage permissions
- **Key Policy**: Check KMS key policy allows Lambda function usage
- **Region Consistency**: Ensure KMS key is in same region as Lambda
- **Alias Usage**: Use key ARN rather than alias for reliability

## Environment Variables Reference

### AWS Discovery Variables
```bash
# Set by discovery process
AWS_DISCOVERY_VPC_ID=vpc-12345678
AWS_DISCOVERY_SECURITY_GROUP_ID=sg-12345678
AWS_DISCOVERY_SUBNET_ID_1=subnet-12345678
AWS_DISCOVERY_SUBNET_ID_2=subnet-87654321
AWS_DISCOVERY_ROUTE_TABLE_ID=rtb-12345678
AWS_DISCOVERY_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
```

### Serverless Framework Variables
```bash
# Set by serverless during deployment
AWS_REGION=us-east-1
STAGE=production
SERVICE_NAME=my-frigg-app
```

### Development/Testing Variables
```bash
# Skip discovery in test environments
SKIP_AWS_DISCOVERY=true

# Use mock data for testing
USE_MOCK_AWS_DATA=true
```

## Related Documentation

- **Phase 3 Deployment**: See `DEPLOYMENT-INSTRUCTIONS.md` for Phase 3 features
- **AWS Discovery**: See `AWS-DISCOVERY-TROUBLESHOOTING.md` for troubleshooting
- **IAM Policies**: See `IAM-POLICY-TEMPLATES.md` for policy examples
- **Testing Strategy**: See `README-TESTING.md` for testing approach
- **WebSocket Config**: See `WEBSOCKET-CONFIGURATION.md` for WebSocket setup