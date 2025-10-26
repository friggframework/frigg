/**
 * AWSPropertyReconciler - AWS Property Drift Reconciliation Adapter
 *
 * Infrastructure Adapter - Hexagonal Architecture
 *
 * Implements IPropertyReconciler port for AWS.
 * Handles property drift reconciliation via template or resource updates.
 *
 * Lazy-loads AWS SDK to minimize cold start time and memory usage.
 */

const IPropertyReconciler = require('../../application/ports/IPropertyReconciler');

// Lazy-loaded AWS SDK clients
let CloudFormationClient, UpdateStackCommand, GetTemplateCommand;
let EC2Client, ModifyVpcAttributeCommand;

/**
 * Lazy load CloudFormation SDK
 */
function loadCloudFormation() {
    if (!CloudFormationClient) {
        const cfModule = require('@aws-sdk/client-cloudformation');
        CloudFormationClient = cfModule.CloudFormationClient;
        UpdateStackCommand = cfModule.UpdateStackCommand;
        GetTemplateCommand = cfModule.GetTemplateCommand;
    }
}

/**
 * Lazy load EC2 SDK
 */
function loadEC2() {
    if (!EC2Client) {
        const ec2Module = require('@aws-sdk/client-ec2');
        EC2Client = ec2Module.EC2Client;
        ModifyVpcAttributeCommand = ec2Module.ModifyVpcAttributeCommand;
    }
}

class AWSPropertyReconciler extends IPropertyReconciler {
    /**
     * Resource types that support reconciliation
     * @private
     */
    static SUPPORTED_TYPES = {
        'AWS::EC2::VPC': {
            templateUpdate: true,
            resourceUpdate: true,
            recommendedMode: 'template',
            limitations: ['Some VPC properties require resource replacement (e.g., CidrBlock)'],
        },
        'AWS::EC2::Subnet': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Most Subnet properties are immutable'],
        },
        'AWS::EC2::SecurityGroup': {
            templateUpdate: true,
            resourceUpdate: true,
            recommendedMode: 'template',
            limitations: ['Rule changes may cause brief connectivity interruption'],
        },
        'AWS::EC2::RouteTable': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Route changes require CloudFormation update'],
        },
        'AWS::RDS::DBCluster': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Many DBCluster properties require specific update windows'],
        },
        'AWS::KMS::Key': {
            templateUpdate: true,
            resourceUpdate: false,
            recommendedMode: 'template',
            limitations: ['Key policy changes must be done via CloudFormation'],
        },
    };

    /**
     * Create AWS Property Reconciler
     *
     * @param {Object} [config={}]
     * @param {string} [config.region] - AWS region (defaults to AWS_REGION env var)
     */
    constructor(config = {}) {
        super();
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.cfClient = null;
        this.ec2Client = null;
    }

    /**
     * Get or create CloudFormation client
     * @private
     */
    _getCFClient() {
        if (!this.cfClient) {
            loadCloudFormation();
            this.cfClient = new CloudFormationClient({ region: this.region });
        }
        return this.cfClient;
    }

    /**
     * Get or create EC2 client
     * @private
     */
    _getEC2Client() {
        if (!this.ec2Client) {
            loadEC2();
            this.ec2Client = new EC2Client({ region: this.region });
        }
        return this.ec2Client;
    }

    /**
     * Check if a property mismatch can be auto-fixed
     */
    async canReconcile(mismatch) {
        // Immutable properties cannot be reconciled (require replacement)
        if (mismatch.requiresReplacement()) {
            return false;
        }

        // Mutable and conditional properties can be reconciled
        // Note: CONDITIONAL may require additional validation, but we treat it as reconcilable
        return true;
    }

    /**
     * Reconcile a single property mismatch
     */
    async reconcileProperty({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        if (mode === 'template') {
            return await this._reconcileViaTemplate({
                stackIdentifier,
                logicalId,
                mismatch,
            });
        } else {
            return await this._reconcileViaResource({
                stackIdentifier,
                logicalId,
                mismatch,
            });
        }
    }

    /**
     * Reconcile multiple property mismatches for a resource
     */
    async reconcileMultipleProperties({
        stackIdentifier,
        logicalId,
        mismatches,
        mode = 'template',
    }) {
        const results = [];
        let reconciledCount = 0;
        let failedCount = 0;

        for (const mismatch of mismatches) {
            try {
                const result = await this.reconcileProperty({
                    stackIdentifier,
                    logicalId,
                    mismatch,
                    mode,
                });

                results.push(result);
                if (result.success) {
                    reconciledCount++;
                } else {
                    failedCount++;
                }
            } catch (error) {
                results.push({
                    success: false,
                    mode,
                    propertyPath: mismatch.propertyPath,
                    message: error.message,
                });
                failedCount++;
            }
        }

        return {
            reconciledCount,
            failedCount,
            results,
            message: `Reconciled ${reconciledCount} of ${mismatches.length} properties`,
        };
    }

    /**
     * Preview property reconciliation without applying changes
     */
    async previewReconciliation({ stackIdentifier, logicalId, mismatch, mode = 'template' }) {
        const canReconcile = await this.canReconcile(mismatch);

        const warnings = [];
        if (mismatch.requiresReplacement()) {
            warnings.push('Property is immutable - requires resource replacement');
        }

        let impact = '';
        if (mode === 'template') {
            impact = 'Will update CloudFormation template to match actual resource state';
        } else {
            impact = 'Will update cloud resource to match template definition';
        }

        return {
            canReconcile,
            mode,
            propertyPath: mismatch.propertyPath,
            currentValue: mismatch.expectedValue,
            proposedValue: mismatch.actualValue,
            impact,
            warnings,
        };
    }

    /**
     * Update CloudFormation template property
     */
    async updateTemplateProperty({ stackIdentifier, logicalId, propertyPath, newValue }) {
        const client = this._getCFClient();

        // Get current template
        const getTemplateCommand = new GetTemplateCommand({
            StackName: stackIdentifier.stackName,
            TemplateStage: 'Original',
        });

        const templateResponse = await client.send(getTemplateCommand);
        const template = JSON.parse(templateResponse.TemplateBody);

        // Update property in template
        const pathParts = propertyPath.split('.');
        let current = template.Resources[logicalId];

        for (let i = 0; i < pathParts.length - 1; i++) {
            if (!current[pathParts[i]]) {
                current[pathParts[i]] = {};
            }
            current = current[pathParts[i]];
        }

        const lastPart = pathParts[pathParts.length - 1];
        current[lastPart] = newValue;

        // Update stack with new template
        const updateCommand = new UpdateStackCommand({
            StackName: stackIdentifier.stackName,
            TemplateBody: JSON.stringify(template),
        });

        const updateResponse = await client.send(updateCommand);

        return {
            success: true,
            changeSetId: updateResponse.StackId,
            message: 'Template property updated successfully',
        };
    }

    /**
     * Update cloud resource property directly
     */
    async updateResourceProperty({ resourceType, physicalId, region, propertyPath, newValue }) {
        // Only VPC properties are supported for direct resource updates in this implementation
        if (resourceType === 'AWS::EC2::VPC') {
            return await this._updateVpcProperty({ physicalId, propertyPath, newValue });
        }

        throw new Error(`Resource type ${resourceType} updates not supported`);
    }

    /**
     * Get reconciliation strategy for a resource type
     */
    async getReconciliationStrategy(resourceType) {
        if (!(resourceType in AWSPropertyReconciler.SUPPORTED_TYPES)) {
            throw new Error(`Resource type ${resourceType} not supported`);
        }

        const config = AWSPropertyReconciler.SUPPORTED_TYPES[resourceType];

        return {
            supportsTemplateUpdate: config.templateUpdate,
            supportsResourceUpdate: config.resourceUpdate,
            recommendedMode: config.recommendedMode,
            limitations: config.limitations,
        };
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    /**
     * Reconcile via template update
     * @private
     */
    async _reconcileViaTemplate({ stackIdentifier, logicalId, mismatch }) {
        await this.updateTemplateProperty({
            stackIdentifier,
            logicalId,
            propertyPath: mismatch.propertyPath,
            newValue: mismatch.actualValue,
        });

        return {
            success: true,
            mode: 'template',
            propertyPath: mismatch.propertyPath,
            oldValue: mismatch.expectedValue,
            newValue: mismatch.actualValue,
            message: 'Template updated to match actual resource state',
        };
    }

    /**
     * Reconcile via resource update
     * @private
     */
    async _reconcileViaResource({ stackIdentifier, logicalId, mismatch }) {
        // This is a simplified implementation
        // In production, would need resource type detection and proper API calls

        // For now, only support VPC properties
        if (!mismatch.propertyPath.includes('EnableDns')) {
            throw new Error('Resource property update not supported for this property');
        }

        // Mock resource update (in real implementation, would use EC2 API)
        const client = this._getEC2Client();
        const command = new ModifyVpcAttributeCommand({
            VpcId: 'vpc-placeholder',
            EnableDnsSupport: { Value: mismatch.expectedValue },
        });

        await client.send(command);

        return {
            success: true,
            mode: 'resource',
            propertyPath: mismatch.propertyPath,
            oldValue: mismatch.actualValue,
            newValue: mismatch.expectedValue,
            message: 'Resource updated to match template definition',
        };
    }

    /**
     * Update VPC property directly
     * @private
     */
    async _updateVpcProperty({ physicalId, propertyPath, newValue }) {
        const client = this._getEC2Client();

        // Map property paths to VPC attribute names
        if (propertyPath === 'Properties.EnableDnsSupport') {
            const command = new ModifyVpcAttributeCommand({
                VpcId: physicalId,
                EnableDnsSupport: { Value: newValue },
            });

            await client.send(command);
        } else if (propertyPath === 'Properties.EnableDnsHostnames') {
            const command = new ModifyVpcAttributeCommand({
                VpcId: physicalId,
                EnableDnsHostnames: { Value: newValue },
            });

            await client.send(command);
        } else {
            throw new Error(`Property ${propertyPath} cannot be updated directly`);
        }

        return {
            success: true,
            message: `VPC property ${propertyPath} updated successfully`,
            updatedAt: new Date(),
        };
    }
}

module.exports = AWSPropertyReconciler;
