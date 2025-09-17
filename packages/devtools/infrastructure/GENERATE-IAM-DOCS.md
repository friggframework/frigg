# Generate IAM Command

The `frigg generate-iam` command creates a customized IAM CloudFormation template based on your specific Frigg application configuration.

## Overview

Instead of using a generic IAM policy that includes all possible permissions, this command analyzes your AppDefinition and generates an IAM stack that only includes the permissions your application actually needs.

## Usage

```bash
npx frigg generate-iam [options]
```

### Options

-   `-o, --output <path>` - Output directory (default: `backend/infrastructure`)
-   `-u, --user <name>` - Deployment user name (default: `frigg-deployment-user`)
-   `-s, --stack-name <name>` - CloudFormation stack name (default: `frigg-deployment-iam`)
-   `-v, --verbose` - Enable verbose output

### Examples

```bash
# Generate with defaults
npx frigg generate-iam

# Specify custom output directory
npx frigg generate-iam --output ./aws-infrastructure

# Custom user name and stack name
npx frigg generate-iam --user my-app-deployer --stack-name my-app-iam

# Verbose output
npx frigg generate-iam --verbose
```

## What Gets Generated

The command analyzes your `backend/index.js` AppDefinition and generates IAM policies based on:

### Always Included (Core Features)

-   **CloudFormation** - Stack management permissions
-   **Lambda** - Function deployment and management
-   **IAM** - Role creation and management for Lambda functions
-   **S3** - Deployment bucket access
-   **SQS/SNS** - Messaging services
-   **CloudWatch/Logs** - Monitoring and logging
-   **API Gateway** - REST API management

### Conditionally Included (Based on AppDefinition)

#### VPC Support (`vpc.enable: true`)

-   VPC endpoint creation and management
-   NAT Gateway creation and management
-   Route table and security group management
-   Elastic IP allocation

#### KMS Encryption (`encryption.fieldLevelEncryptionMethod: 'kms'`)

-   KMS key usage for Lambda and S3
-   Data encryption and decryption permissions

#### SSM Parameter Store (`ssm.enable: true`)

-   Parameter retrieval permissions
-   Scoped to parameters containing "frigg" in the path

#### WebSocket Support (`websockets.enable: true`)

-   Currently included in core permissions
-   API Gateway WebSocket management

## Sample AppDefinition Analysis

Given this AppDefinition:

```javascript
const appDefinition = {
    name: 'my-integration-app',
    integrations: [AsanaIntegration, SlackIntegration],
    vpc: {
        enable: true,
    },
    encryption: {
        fieldLevelEncryptionMethod: 'kms',
    },
    ssm: {
        enable: false,
    },
    websockets: {
        enable: true,
    },
};
```

The command will generate:

-   ✅ Core deployment permissions
-   ✅ VPC management permissions
-   ✅ KMS encryption permissions
-   ❌ SSM Parameter Store permissions (disabled)
-   ✅ WebSocket permissions (via core)

## Generated File Structure

The command creates:

```
backend/infrastructure/
├── frigg-deployment-iam.yaml    # Main CloudFormation template
```

## Security Benefits

### Principle of Least Privilege

-   Only includes permissions your app actually uses
-   Scoped resource patterns (e.g., only resources containing "frigg")
-   No unnecessary cloud service permissions

### Resource Scoping

All permissions are scoped to resources following naming patterns:

-   `*frigg*` - General Frigg resources
-   `*serverless*` - Deployment buckets
-   `internal-error-queue-*` - Error handling queues

### Conditional Policies

Feature-specific policies are only created when:

-   The feature is enabled in your AppDefinition
-   CloudFormation conditions control policy attachment

## Deployment Workflow

After generating the template:

### 1. Deploy the Stack

```bash
aws cloudformation deploy \
  --template-file backend/infrastructure/frigg-deployment-iam.yaml \
  --stack-name frigg-deployment-iam \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides DeploymentUserName=frigg-deployment-user
```

### 2. Retrieve Access Key

```bash
aws cloudformation describe-stacks \
  --stack-name frigg-deployment-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`AccessKeyId`].OutputValue' \
  --output text
```

### 3. Get Secret Access Key

```bash
aws secretsmanager get-secret-value \
  --secret-id frigg-deployment-credentials \
  --query SecretString \
  --output text | jq -r .SecretAccessKey
```

### 4. Configure CI/CD

Add the credentials to your deployment environment:

-   GitHub Actions: Repository secrets
-   GitLab CI: Environment variables
-   Jenkins: Credentials manager
-   Local: AWS credentials file

## Troubleshooting

### Command Not Found

```bash
# Install dependencies
npm install

# Ensure you're in a Frigg project
ls backend/index.js
```

### No AppDefinition Found

-   Ensure `backend/index.js` exports a `Definition` object
-   Check that the Definition follows the correct structure

### Permission Errors During Deployment

-   Ensure your AWS CLI is configured with admin permissions
-   Add `--capabilities CAPABILITY_NAMED_IAM` to deployment commands

### Generated Policy Too Restrictive

-   Check that your resources follow naming conventions (contain "frigg")
-   Enable additional features in your AppDefinition if needed
-   Review the generated template for resource patterns

## Comparison with Generic Template

| Aspect          | Generic Template | Generated Template    |
| --------------- | ---------------- | --------------------- |
| Size            | ~15KB            | ~8-12KB (varies)      |
| Permissions     | All features     | Only enabled features |
| Security        | Broad access     | Scoped access         |
| Maintenance     | Manual updates   | Auto-generated        |
| Deployment Risk | Over-privileged  | Least privilege       |

## Integration with Development Workflow

### Local Development

1. Update AppDefinition
2. Run `npx frigg generate-iam`
3. Deploy updated IAM stack
4. Test deployment with new permissions

### CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Generate IAM Template
  run: npx frigg generate-iam

- name: Deploy IAM Stack
  run: |
      aws cloudformation deploy \
        --template-file backend/infrastructure/frigg-deployment-iam.yaml \
        --stack-name ${{ env.STACK_NAME }} \
        --capabilities CAPABILITY_NAMED_IAM
```

### Version Control

-   Commit generated templates to version control
-   Review changes in pull requests
-   Track permission changes over time

## Best Practices

1. **Regenerate After Changes** - Run the command whenever you modify your AppDefinition
2. **Review Generated Templates** - Check the generated YAML before deployment
3. **Test Deployments** - Verify your app can deploy with the generated permissions
4. **Environment Separation** - Use different stack names for dev/staging/prod
5. **Regular Audits** - Periodically review and minimize permissions

## Advanced Usage

### Custom Parameter Values

```bash
# Enable all features regardless of AppDefinition
npx frigg generate-iam --verbose

# Then manually edit the generated template to set:
# EnableVPCSupport: true
# EnableKMSSupport: true
# EnableSSMSupport: true
```

### Multiple Environments

```bash
# Generate for different environments
npx frigg generate-iam --stack-name my-app-dev-iam --output ./aws/dev
npx frigg generate-iam --stack-name my-app-prod-iam --output ./aws/prod
```

This command helps you maintain secure, minimal IAM policies that evolve with your application requirements.
