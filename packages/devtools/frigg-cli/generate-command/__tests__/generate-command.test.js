const path = require('path');
const fs = require('fs');
const generateCommand = require('../index');

// Mock dependencies
jest.mock('fs');
jest.mock('@friggframework/core');
jest.mock('@inquirer/prompts');
jest.mock('../../../infrastructure/iam-generator');
jest.mock('../terraform-generator');
jest.mock('../azure-generator');
jest.mock('../gcp-generator');

describe('Generate Command', () => {
    const mockBackendDir = '/mock/backend';
    const mockPackageJsonPath = path.join(mockBackendDir, 'package.json');
    const mockAppDefinitionPath = path.join(mockBackendDir, 'index.js');
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock process.exit
        jest.spyOn(process, 'exit').mockImplementation(() => {});
        
        // Mock console methods
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        
        // Mock findNearestBackendPackageJson
        const { findNearestBackendPackageJson } = require('@friggframework/core');
        findNearestBackendPackageJson.mockResolvedValue(mockPackageJsonPath);
        
        // Mock fs operations
        fs.readFileSync.mockImplementation((filePath) => {
            if (filePath === mockPackageJsonPath) {
                return JSON.stringify({ name: 'test-app' });
            }
            return '';
        });
        
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath === mockAppDefinitionPath) {
                return true;
            }
            if (filePath.includes('backend/infrastructure')) {
                return false; // Directory doesn't exist, will be created
            }
            return true;
        });
        
        fs.mkdirSync.mockImplementation(() => {});
        fs.writeFileSync.mockImplementation(() => {});
        
        // Mock app definition
        jest.doMock(mockAppDefinitionPath, () => ({
            vpc: { enable: true },
            encryption: { fieldLevelEncryptionMethod: 'kms' },
            ssm: { enable: true },
            websockets: { enable: false }
        }), { virtual: true });
    });
    
    afterEach(() => {
        jest.restoreAllMocks();
    });
    
    describe('AWS CloudFormation Generation', () => {
        it('should generate CloudFormation template with explicit options', async () => {
            const { generateCloudFormationTemplate } = require('../../../infrastructure/iam-generator');
            generateCloudFormationTemplate.mockResolvedValue('AWSTemplateFormatVersion: 2010-09-09\nDescription: Test template');
            
            await generateCommand({
                provider: 'aws',
                format: 'cloudformation',
                output: 'backend/infrastructure',
                user: 'test-user',
                stackName: 'test-stack'
            });
            
            expect(generateCloudFormationTemplate).toHaveBeenCalledWith({
                appName: 'test-app',
                features: {
                    vpc: true,
                    kms: true,
                    ssm: true,
                    websockets: false
                },
                userPrefix: 'test-user',
                stackName: 'test-stack'
            });
            
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-aws-cloudformation.yaml'),
                expect.stringContaining('AWSTemplateFormatVersion')
            );
            
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Generated cloudformation template for aws'));
        });
        
        it('should handle missing app definition gracefully', async () => {
            fs.existsSync.mockImplementation((filePath) => {
                if (filePath === mockAppDefinitionPath) {
                    return false;
                }
                return true;
            });
            
            await generateCommand({
                provider: 'aws',
                format: 'cloudformation'
            });
            
            expect(console.error).toHaveBeenCalledWith(
                'Error generating deployment credentials:',
                expect.stringContaining('App definition not found')
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });
    
    describe('AWS Terraform Generation', () => {
        it('should generate Terraform template for AWS', async () => {
            const { generateTerraformTemplate } = require('../terraform-generator');
            generateTerraformTemplate.mockResolvedValue('provider "aws" {\n  region = var.region\n}');
            
            await generateCommand({
                provider: 'aws',
                format: 'terraform',
                output: 'backend/infrastructure'
            });
            
            expect(generateTerraformTemplate).toHaveBeenCalledWith({
                appName: 'test-app',
                features: {
                    vpc: true,
                    kms: true,
                    ssm: true,
                    websockets: false
                },
                userPrefix: 'frigg-deployment-user'
            });
            
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-aws-terraform.tf'),
                expect.stringContaining('provider "aws"')
            );
        });
    });
    
    describe('Azure Generators', () => {
        it('should generate ARM template for Azure', async () => {
            const { generateAzureARMTemplate } = require('../azure-generator');
            generateAzureARMTemplate.mockResolvedValue(JSON.stringify({
                "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
                "contentVersion": "1.0.0.0"
            }));
            
            await generateCommand({
                provider: 'azure',
                format: 'arm',
                output: 'backend/infrastructure'
            });
            
            expect(generateAzureARMTemplate).toHaveBeenCalledWith({
                appName: 'test-app',
                features: expect.any(Object),
                userPrefix: 'frigg-deployment-user'
            });
            
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-azure-arm.json'),
                expect.stringContaining('$schema')
            );
        });
        
        it('should generate Terraform template for Azure', async () => {
            const { generateAzureTerraformTemplate } = require('../azure-generator');
            generateAzureTerraformTemplate.mockResolvedValue('provider "azurerm" {\n  features {}\n}');
            
            await generateCommand({
                provider: 'azure',
                format: 'terraform'
            });
            
            expect(generateAzureTerraformTemplate).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-azure-terraform.tf'),
                expect.stringContaining('provider "azurerm"')
            );
        });
    });
    
    describe('GCP Generators', () => {
        it('should generate Deployment Manager template for GCP', async () => {
            const { generateGCPDeploymentManagerTemplate } = require('../gcp-generator');
            generateGCPDeploymentManagerTemplate.mockResolvedValue('resources:\n- name: test-resource\n  type: compute.v1.instance');
            
            await generateCommand({
                provider: 'gcp',
                format: 'deployment-manager'
            });
            
            expect(generateGCPDeploymentManagerTemplate).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-gcp-deployment-manager.yaml'),
                expect.stringContaining('resources:')
            );
        });
        
        it('should generate Terraform template for GCP', async () => {
            const { generateGCPTerraformTemplate } = require('../gcp-generator');
            generateGCPTerraformTemplate.mockResolvedValue('provider "google" {\n  project = var.project_id\n}');
            
            await generateCommand({
                provider: 'gcp',
                format: 'terraform'
            });
            
            expect(generateGCPTerraformTemplate).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('frigg-deployment-gcp-terraform.tf'),
                expect.stringContaining('provider "google"')
            );
        });
    });
    
    describe('Interactive Mode', () => {
        it('should prompt for provider and format when not provided', async () => {
            const { select } = require('@inquirer/prompts');
            select.mockResolvedValueOnce('aws').mockResolvedValueOnce('cloudformation');
            
            const { generateCloudFormationTemplate } = require('../../../infrastructure/iam-generator');
            generateCloudFormationTemplate.mockResolvedValue('AWSTemplateFormatVersion: 2010-09-09');
            
            await generateCommand({});
            
            expect(select).toHaveBeenCalledTimes(2);
            expect(select).toHaveBeenNthCalledWith(1, expect.objectContaining({
                message: 'Select cloud provider:',
                choices: expect.arrayContaining([
                    expect.objectContaining({ name: 'AWS', value: 'aws' }),
                    expect.objectContaining({ name: 'Azure', value: 'azure' }),
                    expect.objectContaining({ name: 'Google Cloud Platform', value: 'gcp' })
                ])
            }));
            
            expect(select).toHaveBeenNthCalledWith(2, expect.objectContaining({
                message: 'Select output format:',
                choices: expect.arrayContaining([
                    expect.objectContaining({ name: 'CloudFormation', value: 'cloudformation' })
                ])
            }));
        });
        
        it('should handle user cancellation gracefully', async () => {
            const { select } = require('@inquirer/prompts');
            const exitError = new Error('User cancelled');
            exitError.name = 'ExitPromptError';
            select.mockRejectedValue(exitError);
            
            await generateCommand({});
            
            expect(console.log).toHaveBeenCalledWith('\n✖ Command cancelled by user');
            expect(process.exit).toHaveBeenCalledWith(0);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle missing Frigg application', async () => {
            const { findNearestBackendPackageJson } = require('@friggframework/core');
            findNearestBackendPackageJson.mockResolvedValue(null);
            
            await generateCommand({
                provider: 'aws',
                format: 'cloudformation'
            });
            
            expect(console.error).toHaveBeenCalledWith(
                'Error generating deployment credentials:',
                'Could not find a Frigg application. Make sure you are in a Frigg project directory.'
            );
            expect(process.exit).toHaveBeenCalledWith(1);
        });
        
        it('should show stack trace in verbose mode', async () => {
            const { findNearestBackendPackageJson } = require('@friggframework/core');
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at testFunction';
            findNearestBackendPackageJson.mockRejectedValue(error);
            
            await generateCommand({
                provider: 'aws',
                format: 'cloudformation',
                verbose: true
            });
            
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('at testFunction'));
        });
        
        it('should handle unsupported formats', async () => {
            await generateCommand({
                provider: 'aws',
                format: 'pulumi'
            });
            
            expect(console.error).toHaveBeenCalledWith(
                'Error generating deployment credentials:',
                'Pulumi support is not yet implemented'
            );
        });
    });
});