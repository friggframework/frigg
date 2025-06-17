# Frigg IAM Deployment Instructions

This guide explains how to deploy the IAM CloudFormation stack to create the necessary AWS credentials for your Frigg deployment pipeline.

## Prerequisites

- AWS CLI installed and configured with administrator privileges
- AWS account ID
- Appropriate permissions to create IAM resources

## Deployment Steps

You can deploy the stack using either the AWS Management Console (UI) or AWS CLI.

### Option A: Deploy via AWS Management Console (UI)

#### 1. Upload and Create Stack

1. Log in to the [AWS Management Console](https://console.aws.amazon.com/)
2. Navigate to **CloudFormation** service
3. Click **Create stack** → **With new resources (standard)**
4. In the **Specify template** section:
   - Select **Upload a template file**
   - Click **Choose file** and select `frigg-deployment-iam-stack.yaml`
   - Click **Next**

#### 2. Configure Stack Details

1. **Stack name**: Enter `frigg-deployment-iam`
2. **Parameters**:
   - **DeploymentUserName**: `frigg-deployment-user` (or customize)
   - **EnableVPCSupport**: `true`
   - **EnableKMSSupport**: `true`
   - **EnableSSMSupport**: `true`
3. Click **Next**

#### 3. Configure Stack Options

1. Leave all options as default (or configure tags if needed)
2. Click **Next**

#### 4. Review and Create

1. Review all settings
2. **Important**: Check the box that says **"I acknowledge that AWS CloudFormation might create IAM resources with custom names"**
3. Click **Submit**
4. Wait for the stack to reach **CREATE_COMPLETE** status (usually 2-3 minutes)

#### 5. Retrieve Credentials from Console

1. Once the stack is created, click on the stack name
2. Go to the **Outputs** tab
3. Note the **AccessKeyId** value
4. To get the Secret Access Key:
   - Click on the **Resources** tab
   - Find **FriggDeploymentCredentials** and click on its Physical ID link
   - This will take you to AWS Secrets Manager
   - Click **Retrieve secret value**
   - Copy the **SecretAccessKey** value

### Option B: Deploy via AWS CLI

#### 1. Deploy the CloudFormation Stack

```bash
aws cloudformation deploy \
  --template-file frigg-deployment-iam-stack.yaml \
  --stack-name frigg-deployment-iam \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    DeploymentUserName=frigg-deployment-user \
    EnableVPCSupport=true \
    EnableKMSSupport=true \
    EnableSSMSupport=true
```

#### 2. Retrieve Deployment Credentials

After successful deployment, retrieve the credentials:

```bash
# Get the Access Key ID
aws cloudformation describe-stacks \
  --stack-name frigg-deployment-iam \
  --query 'Stacks[0].Outputs[?OutputKey==`AccessKeyId`].OutputValue' \
  --output text

# Get the Secret Access Key from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id frigg-deployment-credentials \
  --query SecretString \
  --output text | jq -r .SecretAccessKey
```

### 3. Configure CI/CD Environment

#### GitHub Actions

Add these secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add new repository secrets:
   - `AWS_ACCESS_KEY_ID`: The Access Key ID from step 2
   - `AWS_SECRET_ACCESS_KEY`: The Secret Access Key from step 2

Example GitHub Actions workflow:

```yaml
name: Deploy Frigg Application
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Install dependencies
        run: npm install
      
      - name: Deploy Frigg application
        run: npx frigg deploy
```

#### GitLab CI/CD

Add variables in Settings → CI/CD → Variables:

```yaml
deploy:
  image: node:18
  before_script:
    - npm install
  script:
    - export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
    - export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
    - export AWS_REGION=us-east-1
    - npx frigg deploy
  only:
    - main
```

#### Jenkins

Store credentials in Jenkins Credentials Manager and use in pipeline:

```groovy
pipeline {
    agent any
    environment {
        AWS_ACCESS_KEY_ID = credentials('frigg-aws-access-key-id')
        AWS_SECRET_ACCESS_KEY = credentials('frigg-aws-secret-access-key')
        AWS_REGION = 'us-east-1'
    }
    stages {
        stage('Deploy') {
            steps {
                sh 'npm install'
                sh 'npx frigg deploy'
            }
        }
    }
}
```

### 4. Local Development Setup

For local development, configure AWS CLI profile:

```bash
# Option 1: Use AWS CLI configure
aws configure --profile frigg-deployment
# Enter the Access Key ID and Secret Access Key when prompted

# Option 2: Add to ~/.aws/credentials manually
[frigg-deployment]
aws_access_key_id = YOUR_ACCESS_KEY_ID
aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
```

Use the profile in your deployment:

```bash
export AWS_PROFILE=frigg-deployment
npx frigg deploy
```

## Stack Parameters

- **DeploymentUserName**: Name of the IAM user (default: `frigg-deployment-user`)
- **EnableVPCSupport**: Enable VPC-related permissions (default: `true`)
- **EnableKMSSupport**: Enable KMS encryption permissions (default: `true`)
- **EnableSSMSupport**: Enable SSM Parameter Store permissions (default: `true`)

## Security Best Practices

1. **Rotate Credentials Regularly**: Create a new access key periodically and update your CI/CD systems
2. **Use Separate Stacks**: Deploy separate stacks for dev, staging, and production environments
3. **Enable MFA**: For production deployments, consider using IAM roles with MFA requirements
4. **Audit Access**: Regularly review CloudTrail logs for deployment activities

## Updating the Stack

To update permissions or parameters:

```bash
aws cloudformation update-stack \
  --stack-name frigg-deployment-iam \
  --template-body file://frigg-deployment-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    EnableVPCSupport=false  # Example: disable VPC support
```

## Deleting the Stack

⚠️ **Warning**: This will delete the IAM user and all associated access keys!

```bash
# First, delete any access keys manually
aws iam delete-access-key \
  --user-name frigg-deployment-user \
  --access-key-id YOUR_ACCESS_KEY_ID

# Then delete the stack
aws cloudformation delete-stack --stack-name frigg-deployment-iam
```

## Troubleshooting

### Permission Denied Errors

If you encounter permission errors during deployment:

1. Check that the IAM user name follows the pattern `*frigg*`
2. Ensure your resources (Lambda functions, stacks) include "frigg" in their names
3. Verify the correct AWS region is configured

### Discovery Failures

If AWS resource discovery fails during build:

1. Verify the deployment user has the discovery permissions
2. Check that default VPC and subnets exist in your region
3. Review build logs for specific error messages

### Stack Creation Failures

Common issues:

- **CAPABILITY_NAMED_IAM required**: Add `--capabilities CAPABILITY_NAMED_IAM` to deploy command
- **User already exists**: Choose a different `DeploymentUserName` parameter
- **Policy limit exceeded**: AWS accounts have limits on managed policies; consider consolidating

## Additional Resources

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Frigg Documentation](https://github.com/friggframework/frigg)
- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)