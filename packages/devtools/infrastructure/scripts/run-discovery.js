#!/usr/bin/env node

/**
 * Pre-build script to run AWS discovery and set environment variables
 * This should be run before serverless commands that need AWS resource discovery
 */

const { BuildTimeDiscovery } = require('./build-time-discovery');
const { findNearestBackendPackageJson } = require('@friggframework/core');
const path = require('path');

async function runDiscovery() {
    let appDefinition;
    
    try {
        console.log('🔍 Starting AWS resource discovery...');
        
        // Find the backend package.json to get AppDefinition
        const backendPath = findNearestBackendPackageJson();
        if (!backendPath) {
            console.log('⚠️  No backend package.json found, skipping discovery');
            return;
        }

        const backendDir = path.dirname(backendPath);
        const backendFilePath = path.join(backendDir, 'index.js');
        
        if (!require('fs').existsSync(backendFilePath)) {
            console.log('⚠️  No backend/index.js found, skipping discovery');
            return;
        }

        // Load the app definition
        const backend = require(backendFilePath);
        appDefinition = backend.Definition;

        if (!appDefinition) {
            console.log('⚠️  No Definition found in backend/index.js, skipping discovery');
            return;
        }

        // Check if discovery is needed
        const needsDiscovery = appDefinition.vpc?.enable || 
                              appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms' ||
                              appDefinition.ssm?.enable;
        
        if (!needsDiscovery) {
            console.log('ℹ️  No AWS discovery needed based on app definition');
            return;
        }

        console.log('📋 App requires AWS discovery for:');
        if (appDefinition.vpc?.enable) console.log('   ✅ VPC support');
        if (appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') console.log('   ✅ KMS encryption');
        if (appDefinition.ssm?.enable) console.log('   ✅ SSM parameters');

        // Run discovery
        const discovery = new BuildTimeDiscovery();
        const resources = await discovery.preBuildHook(appDefinition, process.env.AWS_REGION || 'us-east-1');
        
        if (resources) {
            console.log('✅ AWS discovery completed successfully!');
            console.log(`   VPC: ${resources.defaultVpcId}`);
            console.log(`   Subnets: ${resources.privateSubnetId1}, ${resources.privateSubnetId2}`);
            console.log(`   Public Subnet: ${resources.publicSubnetId}`);
            console.log(`   Security Group: ${resources.defaultSecurityGroupId}`);
            console.log(`   Route Table: ${resources.privateRouteTableId}`);
            console.log(`   KMS Key: ${resources.defaultKmsKeyId}`);
        }
        
    } catch (error) {
        console.error('❌ AWS discovery failed:', error.message);
        console.error('');
        
        // Check if this is an AWS SDK missing error
        if (error.message.includes('Cannot find module') && error.message.includes('@aws-sdk')) {
            console.error('🚨 AWS SDK not installed!');
            console.error('');
            console.error('💡 Install AWS SDK dependencies:');
            console.error('   npm install @aws-sdk/client-ec2 @aws-sdk/client-kms @aws-sdk/client-sts');
            console.error('');
        } else {
            console.error('🚨 Discovery is required because your AppDefinition has these features enabled:');
            if (appDefinition.vpc?.enable) console.error('   ❌ VPC support (vpc.enable: true)');
            if (appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') console.error('   ❌ KMS encryption (encryption.fieldLevelEncryptionMethod: \'kms\')');
            if (appDefinition.ssm?.enable) console.error('   ❌ SSM parameters (ssm.enable: true)');
            console.error('');
            console.error('💡 To fix this issue:');
            console.error('   1. Check AWS credentials: aws sts get-caller-identity');
            console.error('   2. Verify IAM permissions (see AWS-IAM-CREDENTIAL-NEEDS.md)');
            console.error('   3. Ensure default VPC exists: aws ec2 describe-vpcs');
            console.error('   4. Check AWS region: aws configure get region');
            console.error('');
        }
        
        console.error('🔧 Or disable features in backend/index.js:');
        console.error('   vpc: { enable: false }');
        console.error('   encryption: { fieldLevelEncryptionMethod: \'aes\' }');
        console.error('   ssm: { enable: false }');
        
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runDiscovery();
}

module.exports = { runDiscovery };