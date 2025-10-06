const fs = require('fs-extra');
const path = require('path');
const { findNearestBackendPackageJson } = require('@friggframework/core');
const { generateIAMCloudFormation, getFeatureSummary } = require('../infrastructure/iam-generator');

/**
 * Generate IAM CloudFormation stack based on current app definition
 * @param {Object} options - Command options
 */
async function generateIamCommand(options = {}) {
    try {
        console.log('🔍 Finding Frigg application...');
        
        // Find the backend package.json
        const backendPath = findNearestBackendPackageJson();
        if (!backendPath) {
            console.error('❌ Could not find backend package.json');
            console.error('   Make sure you are in a Frigg application directory');
            process.exit(1);
        }

        const backendDir = path.dirname(backendPath);
        const backendFilePath = path.join(backendDir, 'index.js');
        
        if (!fs.existsSync(backendFilePath)) {
            console.error('❌ Could not find backend/index.js');
            console.error('   Make sure your Frigg application has a backend/index.js file');
            process.exit(1);
        }

        console.log(`📱 Found Frigg application at: ${backendDir}`);

        // Load the app definition
        const backend = require(backendFilePath);
        const appDefinition = backend.Definition;

        if (!appDefinition) {
            console.error('❌ No Definition found in backend/index.js');
            console.error('   Make sure your backend exports a Definition object');
            process.exit(1);
        }

        // Get feature summary
        const summary = getFeatureSummary(appDefinition);
        
        console.log('\\n📋 Application Analysis:');
        console.log(`   App Name: ${summary.appName}`);
        console.log(`   Integrations: ${summary.integrationCount}`);
        console.log('\\n🔧 Features Detected:');
        console.log(`   ✅ Core deployment (always included)`);
        console.log(`   ${summary.features.vpc ? '✅' : '❌'} VPC support`);
        console.log(`   ${summary.features.kms ? '✅' : '❌'} KMS encryption`);
        console.log(`   ${summary.features.ssm ? '✅' : '❌'} SSM Parameter Store`);
        console.log(`   ${summary.features.websockets ? '✅' : '❌'} WebSocket support`);

        // Generate the CloudFormation template
        console.log('\\n🏗️  Generating IAM CloudFormation template...');

        const deploymentUserName = options.user || 'frigg-deployment-user';
        const stackName = options.stackName || 'frigg-deployment-iam';

        // Use the summary already extracted above (line 44)
        const cloudFormationYaml = generateIAMCloudFormation({
            appName: summary.appName,
            features: summary.features,
            userPrefix: deploymentUserName,
            stackName
        });

        // Determine output file path
        const outputDir = options.output || path.join(backendDir, 'infrastructure');
        await fs.ensureDir(outputDir);
        
        const outputFile = path.join(outputDir, `${stackName}.yaml`);
        
        // Write the file
        await fs.writeFile(outputFile, cloudFormationYaml);
        
        console.log(`\\n✅ IAM CloudFormation template generated successfully!`);
        console.log(`📄 File: ${outputFile}`);
        
        // Show deployment instructions
        console.log('\\n📚 Next Steps:');
        console.log('\\n1. Deploy the CloudFormation stack:');
        console.log(`   aws cloudformation deploy \\\\`);
        console.log(`     --template-file ${path.relative(process.cwd(), outputFile)} \\\\`);
        console.log(`     --stack-name ${stackName} \\\\`);
        console.log(`     --capabilities CAPABILITY_NAMED_IAM \\\\`);
        console.log(`     --parameter-overrides DeploymentUserName=${deploymentUserName}`);
        
        console.log('\\n2. Retrieve credentials:');
        console.log(`   aws cloudformation describe-stacks \\\\`);
        console.log(`     --stack-name ${stackName} \\\\`);
        console.log(`     --query 'Stacks[0].Outputs[?OutputKey==\`AccessKeyId\`].OutputValue' \\\\`);
        console.log(`     --output text`);
        
        console.log('\\n3. Get secret access key:');
        console.log(`   aws secretsmanager get-secret-value \\\\`);
        console.log(`     --secret-id frigg-deployment-credentials \\\\`);
        console.log(`     --query SecretString \\\\`);
        console.log(`     --output text | jq -r .SecretAccessKey`);

        if (options.verbose) {
            console.log('\\n🔍 Generated Template Summary:');
            console.log(`   File size: ${Math.round(cloudFormationYaml.length / 1024)}KB`);
            console.log(`   Features enabled: ${Object.values(summary.features).filter(Boolean).length}`);
        }

    } catch (error) {
        console.error('❌ Error generating IAM template:', error.message);
        if (options.verbose) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

module.exports = { generateIamCommand };