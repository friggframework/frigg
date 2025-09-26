# Frigg Infrastructure

This directory contains the infrastructure-as-code templates and utilities for deploying Frigg applications to AWS.

## Quick Start

```bash
# Install dependencies
npm install

# Run infrastructure tests
npm test

# Deploy basic infrastructure
frigg deploy --stage production

# Deploy with Phase 3 features
frigg deploy --stage production --enable-phase3
```

## Directory Structure

```
infrastructure/
├── README.md                              # This file
├── PHASE3-DEPLOYMENT-GUIDE.md            # Phase 3 deployment guide
├── AWS-DISCOVERY-TROUBLESHOOTING.md      # AWS discovery troubleshooting
├── DEPLOYMENT-INSTRUCTIONS.md            # General deployment instructions
├── README-TESTING.md                     # Testing strategy documentation
├──
├── cloudformation/                        # CloudFormation templates
│   ├── monitoring-infrastructure.yaml    # Enhanced monitoring (Phase 3)
│   ├── cdn-infrastructure.yaml          # CDN and UI distribution (Phase 3)
│   ├── codegen-infrastructure.yaml      # Code generation services (Phase 3)
│   ├── alerting-infrastructure.yaml     # Advanced alerting (Phase 3)
│   └── deployment-pipeline.yaml         # CI/CD pipeline (Phase 3)
├──
├── aws-discovery.js                      # AWS resource discovery utility
├── build-time-discovery.js              # Build-time discovery integration
├── serverless-template.js               # Serverless configuration generator
├── iam-generator.js                      # IAM policy generator
├── create-frigg-infrastructure.js       # Infrastructure creation utility
├── run-discovery.js                     # Discovery runner script
├──
├── __tests__/                           # Test files
│   ├── fixtures/                        # Test fixtures and mock data
│   └── helpers/                         # Test helper utilities
├── aws-discovery.test.js               # AWS discovery tests
├── build-time-discovery.test.js        # Build-time discovery tests
├── serverless-template.test.js         # Serverless template tests
├── iam-generator.test.js               # IAM generator tests
├── integration.test.js                 # End-to-end integration tests
└── ...                                 # Additional test files
```

## Infrastructure Components

### Core Infrastructure (Phase 1-2)

#### 1. Serverless Template Generator (`serverless-template.js`)

Generates complete serverless.yml configurations with:

-   VPC configuration and resource discovery (with optional self-healing)
-   NAT/EIP management strategies (`discover`, `createAndManage`, `useExisting`)
-   KMS encryption for field-level encryption
-   SSM Parameter Store integration
-   Integration-specific functions and queues
-   WebSocket support for real-time features

#### 2. AWS Discovery (`aws-discovery.js`)

Automatically discovers existing AWS resources and highlights misconfigurations:

-   Default VPC and security groups
-   Private subnets for Lambda functions (with routing validation)
-   Customer-managed KMS keys
-   Route tables for VPC endpoints
-   NAT gateways / Elastic IPs and whether remediation is required

#### 3. Build-Time Discovery (`build-time-discovery.js`)

Integrates AWS discovery into the build process:

-   Pre-build hook for serverless deployments
-   Environment variable injection
-   Template variable replacement
-   Error handling and fallback values

### Phase 3 Infrastructure

#### 1. Enhanced Monitoring (`cloudformation/monitoring-infrastructure.yaml`)

Production-ready monitoring with:

-   Code generation service monitoring
-   UI distribution monitoring
-   Advanced CloudWatch dashboards
-   Custom metrics and alarms

#### 2. CDN Infrastructure (`cloudformation/cdn-infrastructure.yaml`)

CloudFront distribution for UI packages:

-   S3 bucket for multi-framework UI packages
-   CloudFront distribution with custom domains
-   Lambda function for package deployment
-   API Gateway for package management

#### 3. Code Generation Infrastructure (`cloudformation/codegen-infrastructure.yaml`)

Serverless code generation platform:

-   SQS queue for generation requests
-   Lambda function with AI/ML integration
-   DynamoDB tracking table
-   S3 storage for templates and generated code
-   ElastiCache for template caching

#### 4. Advanced Alerting (`cloudformation/alerting-infrastructure.yaml`)

Multi-channel alerting system:

-   Multiple SNS topics for alert severity levels
-   Lambda function for alert processing
-   PagerDuty and Slack integration
-   Composite alarms for system health
-   Advanced metrics collection

#### 5. Deployment Pipeline (`cloudformation/deployment-pipeline.yaml`)

CI/CD pipeline for automated deployments:

-   CodePipeline with GitHub integration
-   CodeBuild projects for backend and UI
-   Multi-stage deployment workflow
-   Integration testing and approval gates

## Configuration Options

### App Definition Structure

```javascript
const appDefinition = {
  // Basic configuration
  name: 'my-frigg-app',
  provider: 'aws',

  // VPC configuration
  vpc: {
    enable: true,
    management: 'discover',     // 'discover' | 'create-new' | 'use-existing'
    selfHeal: true,             // Let the template repair routing/NAT issues
    securityGroupIds: [...],    // Optional: custom security groups or CFN Refs
    subnets: {
      management: 'discover',   // 'discover' | 'create' | 'use-existing'
      ids: [...],               // Required when management is 'use-existing'
    },
    natGateway: {
      management: 'discover',   // 'discover' | 'createAndManage' | 'useExisting'
      id: 'nat-xxxxxxxx',       // Required when management is 'useExisting'
    },
    enableVPCEndpoints: true    // Optional: create VPC endpoints
  },

  // KMS encryption
  encryption: {
    fieldLevelEncryptionMethod: 'kms',
    createResourceIfNoneFound: true
  },

  // SSM Parameter Store
  ssm: {
    enable: true
  },

  // WebSocket support (optional)
  websockets: {
    enable: true
  },

  // Integrations
  integrations: [
    { Definition: { name: 'hubspot' } },
    { Definition: { name: 'salesforce' } }
  ]
};
```

### Environment Variables

The infrastructure system uses environment variables for AWS resource references:

```bash
# Automatically set by AWS discovery
AWS_DISCOVERY_VPC_ID=vpc-12345678
AWS_DISCOVERY_SECURITY_GROUP_ID=sg-12345678
AWS_DISCOVERY_SUBNET_ID_1=subnet-12345678
AWS_DISCOVERY_SUBNET_ID_2=subnet-87654321
AWS_DISCOVERY_PUBLIC_SUBNET_ID=subnet-abcdef12
AWS_DISCOVERY_ROUTE_TABLE_ID=rtb-12345678
AWS_DISCOVERY_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012

# Set by serverless framework
AWS_REGION=us-east-1
STAGE=production
SERVICE_NAME=my-frigg-app
```

## Usage Examples

### Basic Deployment

```javascript
const { composeServerlessDefinition } = require('./serverless-template');

const appDefinition = {
    name: 'my-app',
    integrations: [{ Definition: { name: 'hubspot' } }],
};

const serverlessConfig = await composeServerlessDefinition(appDefinition);
// Use serverlessConfig for deployment
```

### VPC-Enabled Deployment

```javascript
const appDefinition = {
    name: 'secure-app',
    vpc: { enable: true },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
    ssm: { enable: true },
    integrations: [{ Definition: { name: 'salesforce' } }],
};

const serverlessConfig = await composeServerlessDefinition(appDefinition);
```

### Phase 3 Deployment with WebSockets

```javascript
const appDefinition = {
    name: 'realtime-app',
    websockets: { enable: true },
    vpc: { enable: true },
    integrations: [{ Definition: { name: 'slack' } }],
};

const serverlessConfig = await composeServerlessDefinition(appDefinition);
```

## Testing

### Running Tests

```bash
# Run all infrastructure tests
npm test

# Run specific test suites
npm test aws-discovery.test.js
npm test serverless-template.test.js
npm test integration.test.js

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

### Test Categories

1. **Unit Tests**: Test individual components

    - AWS discovery utilities
    - Serverless template generation
    - IAM policy generation

2. **Integration Tests**: Test end-to-end workflows

    - Complete discovery and template generation
    - Plugin integration
    - Phase 3 infrastructure validation

3. **Performance Tests**: Validate infrastructure limits
    - CloudFormation template sizes
    - Resource count limits
    - Cross-stack dependencies

### Mock Data

Tests use mock AWS resources to avoid real AWS API calls:

```javascript
const mockAWSResources = {
    defaultVpcId: 'vpc-12345678',
    defaultSecurityGroupId: 'sg-12345678',
    privateSubnetId1: 'subnet-private-1',
    privateSubnetId2: 'subnet-private-2',
    defaultKmsKeyId:
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
};
```

## Security

### IAM Permissions

The infrastructure requires specific IAM permissions for AWS resource discovery and deployment:

-   **EC2**: Describe VPCs, subnets, security groups, route tables
-   **KMS**: List keys, describe keys
-   **STS**: Get caller identity
-   **CloudFormation**: Full access for stack operations
-   **Lambda**: Function management
-   **API Gateway**: API management
-   **S3**: Bucket and object operations (including tagging)
-   **DynamoDB**: Table operations
-   **SQS**: Queue operations
-   **SNS**: Topic operations
-   **CloudWatch**: Metrics and alarms
-   **IAM**: Role and policy management

### Best Practices

1. **Least Privilege**: IAM roles have minimal required permissions
2. **Encryption**: All data encrypted at rest and in transit
3. **VPC Security**: Lambda functions in private subnets when needed
4. **Access Control**: S3 buckets block public access by default
5. **Audit Logging**: CloudTrail integration for API calls

## Troubleshooting

### Common Issues

#### AWS Discovery Failures

```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify region configuration
echo $AWS_REGION

# Test VPC discovery
node -e "
  const { AWSDiscovery } = require('./aws-discovery');
  const discovery = new AWSDiscovery('us-east-1');
  discovery.findDefaultVpc().then(console.log).catch(console.error);
"
```

#### Serverless Deployment Issues

```bash
# Enable debug logging
SLS_DEBUG=true serverless deploy

# Check generated template
serverless print

# Validate CloudFormation template
aws cloudformation validate-template --template-body file://template.json
```

-   **Connectivity to external services (e.g., databases):** If your Lambda functions in a VPC cannot connect to external services, ensure that the `FriggLambdaSecurityGroup` has the correct **egress** rules to allow outbound traffic on the required ports (e.g., port 27017 for MongoDB).

#### Infrastructure Test Failures

```bash
# Run specific failing test
npm test -- --testNamePattern="should discover all AWS resources"

# Debug with verbose output
npm test -- --verbose --silent=false

# Check test environment
npm run test:debug
```

### Performance Optimization

#### Lambda Cold Starts

-   Use provisioned concurrency for critical functions
-   Optimize function size and dependencies
-   Monitor cold start metrics

#### VPC Performance

-   Use VPC endpoints to reduce NAT Gateway costs
-   Monitor ENI creation/deletion times
-   Consider Lambda@Edge for global distribution

#### Cost Optimization

-   Use S3 Intelligent Tiering
-   Configure CloudWatch log retention
-   Monitor and alert on unexpected usage

## Contributing

### Adding New Infrastructure Components

1. Create CloudFormation template in `cloudformation/`
2. Add validation tests in `__tests__/`
3. Update integration tests
4. Document in deployment guide
5. Add to CI/CD pipeline

### Testing Guidelines

1. Mock all AWS API calls
2. Test both success and failure scenarios
3. Validate CloudFormation template syntax
4. Test cross-stack dependencies
5. Include performance and security tests

### Documentation

1. Update this README for new features
2. Add examples to deployment guide
3. Document troubleshooting steps
4. Include security considerations

## Support

-   **Documentation**: See `PHASE3-DEPLOYMENT-GUIDE.md` for detailed deployment instructions
-   **Testing**: See `README-TESTING.md` for testing strategy
-   **Troubleshooting**: See `AWS-DISCOVERY-TROUBLESHOOTING.md` for common issues
-   **Issues**: Create GitHub issues for bugs and feature requests
-   **Discussions**: Use GitHub Discussions for questions and ideas

## Related Documentation

-   [Phase 3 Deployment Guide](./PHASE3-DEPLOYMENT-GUIDE.md)
-   [Testing Strategy](./README-TESTING.md)
-   [AWS Discovery Troubleshooting](./AWS-DISCOVERY-TROUBLESHOOTING.md)
-   [IAM Policy Templates](./IAM-POLICY-TEMPLATES.md)
-   [VPC Configuration](./VPC-CONFIGURATION.md)
-   [WebSocket Configuration](./WEBSOCKET-CONFIGURATION.md)
