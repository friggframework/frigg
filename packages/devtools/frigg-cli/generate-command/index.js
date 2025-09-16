const path = require('path');
const fs = require('fs');
const { findNearestBackendPackageJson } = require('../utils/backend-path');
const { select } = require('@inquirer/prompts');

// Import generators for different formats
const { generateCloudFormationTemplate } = require('../../infrastructure/iam-generator');
const { generateTerraformTemplate } = require('./terraform-generator');
const { generateAzureARMTemplate, generateAzureTerraformTemplate } = require('./azure-generator');
const { generateGCPDeploymentManagerTemplate, generateGCPTerraformTemplate } = require('./gcp-generator');

async function generateCommand(options = {}) {
    // Set up graceful exit handler
    process.on('SIGINT', () => {
        console.log('\n✖ Command cancelled by user');
        process.exit(0);
    });

    try {
        // Interactive mode: ask for cloud provider and format if not provided
        if (!options.provider) {
            try {
                options.provider = await select({
                    message: 'Select cloud provider:',
                    choices: [
                        { name: 'AWS', value: 'aws' },
                        { name: 'Azure', value: 'azure' },
                        { name: 'Google Cloud Platform', value: 'gcp' }
                    ]
                });
            } catch (error) {
                if (error.name === 'ExitPromptError') {
                    console.log('\n✖ Command cancelled by user');
                    process.exit(0);
                }
                throw error;
            }
        }

        if (!options.format) {
            // Determine format choices based on provider
            let formatChoices;
            let defaultFormat;
            if (options.provider === 'aws') {
                formatChoices = [
                    { name: 'CloudFormation', value: 'cloudformation' },
                    { name: 'Terraform', value: 'terraform' },
                    { name: 'Pulumi', value: 'pulumi' }
                ];
                defaultFormat = 'cloudformation';
            } else if (options.provider === 'azure') {
                formatChoices = [
                    { name: 'ARM Template', value: 'arm' },
                    { name: 'Terraform', value: 'terraform' },
                    { name: 'Pulumi', value: 'pulumi' }
                ];
                defaultFormat = 'arm';
            } else if (options.provider === 'gcp') {
                formatChoices = [
                    { name: 'Deployment Manager', value: 'deployment-manager' },
                    { name: 'Terraform', value: 'terraform' },
                    { name: 'Pulumi', value: 'pulumi' }
                ];
                defaultFormat = 'deployment-manager';
            }

            try {
                options.format = await select({
                    message: 'Select output format:',
                    choices: formatChoices
                });
            } catch (error) {
                if (error.name === 'ExitPromptError') {
                    console.log('\n✖ Command cancelled by user');
                    process.exit(0);
                }
                throw error;
            }
        }

        // Find the Frigg application
        const nearestBackendPackageJson = await findNearestBackendPackageJson();
        if (!nearestBackendPackageJson) {
            throw new Error('Could not find a Frigg application. Make sure you are in a Frigg project directory.');
        }

        const backendDir = path.dirname(nearestBackendPackageJson);
        const backendPackageJsonFile = JSON.parse(fs.readFileSync(nearestBackendPackageJson, 'utf8'));
        const appName = backendPackageJsonFile.name || 'frigg-app';
        
        if (options.verbose) {
            console.log('Current directory:', process.cwd());
            console.log('Backend package.json found at:', nearestBackendPackageJson);
            console.log('Backend directory:', backendDir);
        }

        // Load app definition
        const appDefinitionPath = path.join(backendDir, 'index.js');
        if (!fs.existsSync(appDefinitionPath)) {
            throw new Error(`App definition not found at ${appDefinitionPath}`);
        }

        // Analyze the app definition
        const appModule = require(appDefinitionPath);
        const appDefinition = appModule.Definition || appModule;
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

        // Ensure output directory exists - smart path detection
        let outputDir;
        if (options.output) {
            // If user specified output, use it as-is
            outputDir = path.resolve(options.output);
        } else {
            // Smart default: put infrastructure in the backend directory we found
            outputDir = path.join(backendDir, 'infrastructure');
        }

        if (options.verbose) {
            console.log('Output directory will be:', outputDir);
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write the template
        const outputFileName = `frigg-deployment-${options.provider}-${options.format}.${fileExtension}`;
        const outputPath = path.join(outputDir, outputFileName);
        fs.writeFileSync(outputPath, template);

        // Generate relative path for instructions
        const relativeOutputDir = path.relative(process.cwd(), outputDir);
        const relativeOutputPath = path.join(relativeOutputDir, outputFileName);

        console.log(`\n✅ Generated ${options.format} template for ${options.provider}`);
        console.log(`📄 Template saved to: ${outputPath}`);
        // Update deployment instructions with actual paths
        if (deploymentInstructions) {
            deploymentInstructions = deploymentInstructions
                .replace(/backend\/infrastructure/g, relativeOutputDir)
                .replace(/file:\/\/backend\/infrastructure/g, `file://${relativeOutputDir}`);
        }
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
        kms: appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms',
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