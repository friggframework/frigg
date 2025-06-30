# Frigg Phase 3 Infrastructure Deployment Guide

This guide covers the deployment of Phase 3 infrastructure components for Frigg, including CDN distribution, code generation services, advanced monitoring, and deployment pipelines.

## Overview

Phase 3 infrastructure includes:

- **CDN Infrastructure**: CloudFront distribution for multi-framework UI packages
- **Code Generation Infrastructure**: Serverless code generation with AI/ML integration
- **Advanced Alerting**: Multi-channel alerting with PagerDuty/Slack integration
- **Deployment Pipeline**: CI/CD pipeline for automated deployments
- **Enhanced Monitoring**: Phase 3-specific metrics and dashboards

## Prerequisites

### AWS Requirements

- AWS CLI v2.x configured with appropriate credentials
- AWS account with sufficient permissions (see IAM requirements below)
- Route 53 hosted zone (optional, for custom domains)
- ACM certificate (optional, for custom domains)

### Development Tools

- Node.js 20.x or later
- npm 10.x or later
- Serverless Framework 3.17.0 or later
- Docker (for local testing)

### External Services (Optional)

- PagerDuty account and integration key
- Slack workspace and webhook URL
- GitHub repository for pipeline integration

## Infrastructure Components

### 1. Enhanced Monitoring Infrastructure

**File**: `cloudformation/monitoring-infrastructure.yaml`

Enhanced version of the original monitoring template with Phase 3 features:

- Code generation service monitoring
- UI distribution monitoring
- Advanced CloudWatch dashboards
- Custom metrics for Phase 3 services

#### Deployment

```bash
# Deploy monitoring infrastructure
aws cloudformation deploy \
  --template-file cloudformation/monitoring-infrastructure.yaml \
  --stack-name frigg-production-monitoring \
  --parameter-overrides \
    ServiceName=frigg \
    Stage=production \
    NotificationEmail=alerts@yourcompany.com \
    CodeGenerationEnabled=true \
    UIDistributionEnabled=true \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

#### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| ServiceName | Service name for resource naming | frigg | No |
| Stage | Deployment stage | production | No |
| NotificationEmail | Email for monitoring alerts | - | Yes |
| CodeGenerationEnabled | Enable code generation monitoring | true | No |
| UIDistributionEnabled | Enable UI distribution monitoring | true | No |

### 2. CDN Infrastructure

**File**: `cloudformation/cdn-infrastructure.yaml`

CloudFront distribution for multi-framework UI package distribution:

- S3 bucket for UI packages
- CloudFront distribution with custom domains
- Lambda function for package deployment
- API Gateway for package management

#### Deployment

```bash
# Deploy CDN infrastructure
aws cloudformation deploy \
  --template-file cloudformation/cdn-infrastructure.yaml \
  --stack-name frigg-production-cdn \
  --parameter-overrides \
    ServiceName=frigg \
    Stage=production \
    DomainName=cdn.yourcompany.com \
    CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012 \
    EnableLogging=true \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

#### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| ServiceName | Service name for resource naming | frigg | No |
| Stage | Deployment stage | production | No |
| DomainName | Custom domain name for CDN | - | No |
| CertificateArn | SSL certificate ARN | - | No* |
| EnableLogging | Enable CloudFront access logging | true | No |

*Required if DomainName is provided

### 3. Code Generation Infrastructure

**File**: `cloudformation/codegen-infrastructure.yaml`

Serverless infrastructure for AI-powered code generation:

- SQS queue for generation requests
- Lambda function for code generation
- DynamoDB table for tracking
- S3 buckets for templates and generated code
- ElastiCache for template caching (optional)

#### Deployment

```bash
# Deploy code generation infrastructure
aws cloudformation deploy \
  --template-file cloudformation/codegen-infrastructure.yaml \
  --stack-name frigg-production-codegen \
  --parameter-overrides \
    ServiceName=frigg \
    Stage=production \
    ModelEndpoint=https://api.openai.com/v1/chat/completions \
    MaxConcurrentGenerations=10 \
    GenerationTimeout=300 \
    EnableTemplateCache=true \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

#### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| ServiceName | Service name for resource naming | frigg | No |
| Stage | Deployment stage | production | No |
| ModelEndpoint | AI/ML model endpoint URL | - | No |
| MaxConcurrentGenerations | Max concurrent generation requests | 10 | No |
| GenerationTimeout | Generation timeout in seconds | 300 | No |
| EnableTemplateCache | Enable template caching | true | No |

### 4. Advanced Alerting Infrastructure

**File**: `cloudformation/alerting-infrastructure.yaml`

Multi-channel alerting system with advanced alert processing:

- Multiple SNS topics for different alert severities
- Lambda function for alert processing
- Composite alarms for system health
- Integration with PagerDuty and Slack

#### Deployment

```bash
# Deploy alerting infrastructure
aws cloudformation deploy \
  --template-file cloudformation/alerting-infrastructure.yaml \
  --stack-name frigg-production-alerting \
  --parameter-overrides \
    ServiceName=frigg \
    Stage=production \
    PagerDutyIntegrationKey=YOUR_PAGERDUTY_KEY \
    SlackWebhookUrl=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK \
    CriticalAlertEmail=oncall@yourcompany.com \
    TeamNotificationEmail=team@yourcompany.com \
    EnableAdvancedMetrics=true \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

#### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| ServiceName | Service name for resource naming | frigg | No |
| Stage | Deployment stage | production | No |
| PagerDutyIntegrationKey | PagerDuty integration key | - | No |
| SlackWebhookUrl | Slack webhook URL | - | No |
| CriticalAlertEmail | Email for critical alerts | - | No |
| TeamNotificationEmail | Email for team notifications | - | No |
| EnableAdvancedMetrics | Enable advanced metrics collection | true | No |

### 5. Deployment Pipeline Infrastructure

**File**: `cloudformation/deployment-pipeline.yaml`

CI/CD pipeline for automated Frigg deployments:

- CodePipeline with GitHub integration
- CodeBuild projects for backend and UI
- Multi-stage deployment workflow
- Integration testing

#### Deployment

```bash
# Deploy pipeline infrastructure
aws cloudformation deploy \
  --template-file cloudformation/deployment-pipeline.yaml \
  --stack-name frigg-deployment-pipeline \
  --parameter-overrides \
    ServiceName=frigg \
    GitHubRepoOwner=yourorg \
    GitHubRepoName=frigg \
    GitHubToken=ghp_your_github_token \
    BranchName=main \
    NotificationEmail=dev-team@yourcompany.com \
    EnableMultiStageDeployment=true \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

#### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| ServiceName | Service name for resource naming | frigg | No |
| GitHubRepoOwner | GitHub repository owner | - | Yes* |
| GitHubRepoName | GitHub repository name | - | Yes* |
| GitHubToken | GitHub personal access token | - | Yes* |
| BranchName | Git branch for deployments | main | No |
| NotificationEmail | Email for pipeline notifications | - | No |
| EnableMultiStageDeployment | Enable multi-stage deployment | true | No |

*Required for pipeline automation

## Deployment Order

Deploy infrastructure components in the following order to ensure proper dependencies:

1. **Enhanced Monitoring Infrastructure** (base monitoring)
2. **CDN Infrastructure** (UI distribution)
3. **Code Generation Infrastructure** (code generation services)
4. **Advanced Alerting Infrastructure** (alerting and notifications)
5. **Deployment Pipeline Infrastructure** (CI/CD automation)

## Environment-Specific Deployments

### Development Environment

```bash
# Development parameters
STAGE=development
NOTIFICATION_EMAIL=dev-alerts@yourcompany.com
ENABLE_LOGGING=false
MAX_CONCURRENT_GENERATIONS=5
```

### Staging Environment

```bash
# Staging parameters
STAGE=staging
NOTIFICATION_EMAIL=staging-alerts@yourcompany.com
ENABLE_LOGGING=true
MAX_CONCURRENT_GENERATIONS=8
```

### Production Environment

```bash
# Production parameters
STAGE=production
NOTIFICATION_EMAIL=production-alerts@yourcompany.com
ENABLE_LOGGING=true
MAX_CONCURRENT_GENERATIONS=20
ENABLE_ADVANCED_METRICS=true
```

## Post-Deployment Configuration

### 1. Configure Code Generation Templates

Upload default templates to the template storage bucket:

```bash
# Upload integration template
aws s3 cp templates/integration-template.json \
  s3://frigg-production-templates-123456789012/templates/integration.json

# Upload API endpoint template
aws s3 cp templates/api-endpoint-template.json \
  s3://frigg-production-templates-123456789012/templates/api-endpoint.json
```

### 2. Set Up UI Package Distribution

Initialize the CDN with UI packages:

```bash
# Deploy initial UI packages
npm run build:ui-packages
npm run deploy:ui-packages --stage=production
```

### 3. Configure External Integrations

#### PagerDuty Setup

1. Create a new service in PagerDuty
2. Get the integration key
3. Update the alerting stack with the integration key

#### Slack Setup

1. Create a new Slack app
2. Enable incoming webhooks
3. Create a webhook URL for your channel
4. Update the alerting stack with the webhook URL

### 4. Test Deployments

Run integration tests to verify all components are working:

```bash
# Test monitoring
npm run test:monitoring

# Test CDN
npm run test:cdn

# Test code generation
npm run test:codegen

# Test alerting
npm run test:alerting

# Test pipeline
npm run test:pipeline
```

## Monitoring and Observability

### CloudWatch Dashboards

After deployment, access the following dashboards:

- **Main Dashboard**: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=frigg-production-monitoring`
- **Phase 3 Dashboard**: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=frigg-production-phase3-monitoring`

### Key Metrics to Monitor

#### CDN Metrics
- Request count and error rates
- Cache hit ratio
- Origin latency
- Bandwidth usage

#### Code Generation Metrics
- Generation request volume
- Generation success/failure rates
- Processing time
- Queue depth

#### System Health Metrics
- Lambda function errors and duration
- API Gateway 4xx/5xx errors
- SQS message backlog
- DynamoDB throttling

### Alert Channels

- **Critical Alerts**: PagerDuty + Email
- **Warning Alerts**: Slack + Email
- **Info Alerts**: Slack only

## Troubleshooting

### Common Issues

#### 1. CloudFormation Stack Failures

```bash
# Check stack events
aws cloudformation describe-stack-events \
  --stack-name frigg-production-monitoring

# Get failure reason
aws cloudformation describe-stack-resources \
  --stack-name frigg-production-monitoring
```

#### 2. Lambda Function Errors

```bash
# Check function logs
aws logs tail /aws/lambda/frigg-production-code-generator --follow

# Check function metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=frigg-production-code-generator \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 300 \
  --statistics Sum
```

#### 3. CDN Distribution Issues

```bash
# Check distribution status
aws cloudfront get-distribution --id E1234567890123

# Check distribution configuration
aws cloudfront get-distribution-config --id E1234567890123
```

#### 4. Pipeline Failures

```bash
# Check pipeline execution
aws codepipeline get-pipeline-execution \
  --pipeline-name frigg-deployment-pipeline \
  --pipeline-execution-id 12345678-1234-1234-1234-123456789012

# Check build logs
aws logs tail /aws/codebuild/frigg-backend-build --follow
```

### Performance Optimization

#### Lambda Functions
- Monitor cold start times
- Adjust memory allocation based on usage
- Enable provisioned concurrency for critical functions

#### DynamoDB
- Monitor read/write capacity usage
- Enable auto-scaling if needed
- Use DynamoDB Accelerator (DAX) for high-read workloads

#### S3/CloudFront
- Configure appropriate cache policies
- Use compression for text-based assets
- Monitor origin request rates

## Security Considerations

### IAM Permissions

All infrastructure follows least-privilege principles:
- Lambda functions have minimal required permissions
- S3 buckets block public access by default
- API Gateway uses IAM authentication
- CloudFormation roles are scoped to specific resources

### Data Encryption

- S3 buckets use AES-256 encryption
- SNS topics use AWS KMS encryption
- DynamoDB tables encrypt data at rest
- CloudFront uses TLS 1.2+ for viewer connections

### Network Security

- Lambda functions run in VPC when accessing private resources
- Security groups restrict access to required ports only
- S3 bucket policies enforce CloudFront-only access

### Secrets Management

- Use AWS Secrets Manager for sensitive configuration
- Store API keys and tokens securely
- Rotate credentials regularly

## Cost Optimization

### Monitoring Costs

- Set up billing alerts for unexpected usage
- Monitor AWS Cost Explorer regularly
- Use AWS Budgets for proactive cost management

### Resource Optimization

- Use reserved capacity for predictable workloads
- Enable S3 Intelligent Tiering
- Configure lifecycle policies for log retention
- Use spot instances for non-critical batch processing

## Backup and Disaster Recovery

### Data Backup

- S3 versioning enabled for all buckets
- DynamoDB point-in-time recovery enabled
- CloudFormation templates stored in version control

### Disaster Recovery

- Infrastructure deployed across multiple AZs
- CloudFormation templates enable quick recovery
- Regular backup testing procedures

## Support and Maintenance

### Regular Maintenance Tasks

- Update Lambda runtime versions
- Review and update IAM permissions
- Monitor security advisories
- Update CloudFormation templates

### Support Contacts

- **Infrastructure Issues**: infrastructure-team@yourcompany.com
- **Application Issues**: dev-team@yourcompany.com
- **Emergency**: Use PagerDuty escalation

For additional support, see the [Frigg documentation](../../../docs/) or contact the development team.