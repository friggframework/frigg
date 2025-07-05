const path = require('path');
const fs = require('fs');
const { findNearestBackendPackageJson } = require('@friggframework/core');
const inquirer = require('inquirer');

// Import generators for different formats
const { generateCloudFormationTemplate } = require('../../infrastructure/iam-generator');
const { generateTerraformTemplate } = require('./terraform-generator');
const { generateAzureARMTemplate, generateAzureTerraformTemplate } = require('./azure-generator');
const { generateGCPDeploymentManagerTemplate, generateGCPTerraformTemplate } = require('./gcp-generator');

async function generateCommand(options = {}) {
    try {
        // Interactive mode: ask for cloud provider and format if not provided
        if (!options.provider || !options.format) {
            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'provider',
                    message: 'Select cloud provider:',
                    choices: ['aws', 'azure', 'gcp'],
                    default: 'aws',
                    when: !options.provider
                },
                {
                    type: 'list',
                    name: 'format',
                    message: 'Select output format:',
                    choices: (answers) => {
                        const provider = options.provider || answers.provider;
                        if (provider === 'aws') {
                            return ['cloudformation', 'terraform', 'pulumi'];
                        } else if (provider === 'azure') {
                            return ['arm', 'terraform', 'pulumi'];
                        } else if (provider === 'gcp') {
                            return ['deployment-manager', 'terraform', 'pulumi'];
                        }
                    },
                    default: (answers) => {
                        const provider = options.provider || answers.provider;
                        if (provider === 'aws') return 'cloudformation';
                        if (provider === 'azure') return 'arm';
                        if (provider === 'gcp') return 'deployment-manager';
                    },
                    when: !options.format
                }
            ]);

            // Merge answers with options
            options = { ...options, ...answers };
        }

        // Find the Frigg application
        const nearestBackendPackageJson = await findNearestBackendPackageJson();
        if (!nearestBackendPackageJson) {
            throw new Error('Could not find a Frigg application. Make sure you are in a Frigg project directory.');
        }

        const backendDir = path.dirname(nearestBackendPackageJson);
        const backendPackageJsonFile = JSON.parse(fs.readFileSync(nearestBackendPackageJson, 'utf8'));
        const appName = backendPackageJsonFile.name || 'frigg-app';

        // Load app definition
        const appDefinitionPath = path.join(backendDir, 'index.js');
        if (!fs.existsSync(appDefinitionPath)) {
            throw new Error(`App definition not found at ${appDefinitionPath}`);
        }

        // Analyze the app definition
        const appDefinition = require(appDefinitionPath);
        const features = analyzeAppFeatures(appDefinition);

        if (options.verbose) {
            console.log('Detected features:', features);
        }

        // Generate based on provider and format
        let template;
        let fileExtension;
        let deploymentInstructions;

        if (options.provider === 'aws') {
            if (options.format === 'cloudformation') {
                template = await generateCloudFormationTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user',
                    stackName: options.stackName || 'frigg-deployment-iam'
                });
                fileExtension = 'yaml';
                deploymentInstructions = generateCloudFormationInstructions(options);
            } else if (options.format === 'terraform') {
                template = await generateTerraformTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user'
                });
                fileExtension = 'tf';
                deploymentInstructions = generateTerraformInstructions(options);
            } else if (options.format === 'pulumi') {
                throw new Error('Pulumi support is not yet implemented');
            }
        } else if (options.provider === 'azure') {
            if (options.format === 'arm') {
                template = await generateAzureARMTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user'
                });
                fileExtension = 'json';
                deploymentInstructions = generateAzureInstructions(options);
            } else if (options.format === 'terraform') {
                template = await generateAzureTerraformTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user'
                });
                fileExtension = 'tf';
                deploymentInstructions = generateTerraformInstructions(options);
            } else if (options.format === 'pulumi') {
                throw new Error('Pulumi support for Azure is not yet implemented');
            }
        } else if (options.provider === 'gcp') {
            if (options.format === 'deployment-manager') {
                template = await generateGCPDeploymentManagerTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user'
                });
                fileExtension = 'yaml';
                deploymentInstructions = generateGCPInstructions(options);
            } else if (options.format === 'terraform') {
                template = await generateGCPTerraformTemplate({
                    appName,
                    features,
                    userPrefix: options.user || 'frigg-deployment-user'
                });
                fileExtension = 'tf';
                deploymentInstructions = generateTerraformInstructions(options);
            } else if (options.format === 'pulumi') {
                throw new Error('Pulumi support for GCP is not yet implemented');
            }
        } else {
            throw new Error(`Provider ${options.provider} is not yet implemented`);
        }

        // Ensure output directory exists
        const outputDir = path.resolve(options.output || 'backend/infrastructure');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write the template
        const outputFileName = `frigg-deployment-${options.provider}-${options.format}.${fileExtension}`;
        const outputPath = path.join(outputDir, outputFileName);
        fs.writeFileSync(outputPath, template);

        console.log(`\n✅ Generated ${options.format} template for ${options.provider}`);
        console.log(`📄 Template saved to: ${outputPath}`);
        console.log('\n' + deploymentInstructions);

    } catch (error) {
        console.error('Error generating deployment credentials:', error.message);
        if (options.verbose && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

function analyzeAppFeatures(appDefinition) {
    const features = {
        vpc: appDefinition.vpc?.enable === true,
        kms: appDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true,
        ssm: appDefinition.ssm?.enable === true,
        websockets: appDefinition.websockets?.enable === true,
        // Add more feature detection as needed
    };

    return features;
}

function generateCloudFormationInstructions(options) {
    const stackName = options.stackName || 'frigg-deployment-iam';
    return `
📋 Deployment Instructions (CloudFormation):

1. Deploy the CloudFormation stack:
   aws cloudformation create-stack \\
     --stack-name ${stackName} \\
     --template-body file://${options.output || 'backend/infrastructure'}/frigg-deployment-aws-cloudformation.yaml \\
     --capabilities CAPABILITY_NAMED_IAM

2. Wait for stack creation to complete:
   aws cloudformation wait stack-create-complete --stack-name ${stackName}

3. Retrieve the created user ARN:
   aws cloudformation describe-stacks \\
     --stack-name ${stackName} \\
     --query 'Stacks[0].Outputs[?OutputKey==\`UserArn\`].OutputValue' \\
     --output text

4. Retrieve the access key ID:
   aws cloudformation describe-stacks \\
     --stack-name ${stackName} \\
     --query 'Stacks[0].Outputs[?OutputKey==\`AccessKeyId\`].OutputValue' \\
     --output text

5. Retrieve the secret access key from Secrets Manager:
   SECRET_NAME=$(aws cloudformation describe-stacks \\
     --stack-name ${stackName} \\
     --query 'Stacks[0].Outputs[?OutputKey==\`SecretName\`].OutputValue' \\
     --output text)
   
   aws secretsmanager get-secret-value \\
     --secret-id $SECRET_NAME \\
     --query 'SecretString' \\
     --output text
`;
}

function generateTerraformInstructions(options) {
    return `
📋 Deployment Instructions (Terraform):

1. Initialize Terraform:
   cd ${options.output || 'backend/infrastructure'}
   terraform init

2. Review the plan:
   terraform plan

3. Apply the configuration:
   terraform apply

4. Retrieve the outputs:
   terraform output -json

5. The access key ID and secret will be displayed in the outputs.
   Store them securely and use them for your CI/CD pipeline.

⚠️  Security Note: The secret access key is sensitive. Consider using:
   - terraform output -raw secret_access_key | pbcopy  # Copy to clipboard
   - Store in your CI/CD secret management system
   - Delete local state file if not using remote state
`;
}

function generateAzureInstructions(options) {
    return `
📋 Deployment Instructions (Azure ARM):

Azure ARM template support is coming soon.
For now, please use Terraform for Azure deployments.

To use Terraform with Azure:
1. Run: frigg generate --provider azure --format terraform
2. Follow the Terraform deployment instructions
`;
}

function generateGCPInstructions(options) {
    return `
📋 Deployment Instructions (GCP Deployment Manager):

GCP Deployment Manager support is coming soon.
For now, please use Terraform for GCP deployments.

To use Terraform with GCP:
1. Run: frigg generate --provider gcp --format terraform
2. Follow the Terraform deployment instructions
`;
}

module.exports = generateCommand;