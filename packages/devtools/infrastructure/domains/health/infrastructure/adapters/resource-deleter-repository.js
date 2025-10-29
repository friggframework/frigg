class ResourceDeleterRepository {
    constructor({ ec2Client, region }) {
        this.ec2Client = ec2Client;
        this.region = region || process.env.AWS_REGION || 'us-east-1';
    }

    async deleteResource({ physicalId, resourceType }) {
        try {
            const deleteCommand = this._getDeleteCommand(resourceType, physicalId);

            if (!deleteCommand) {
                return {
                    success: false,
                    physicalId,
                    resourceType,
                    error: `Unsupported resource type: ${resourceType}`,
                    retryable: false,
                };
            }

            await this.ec2Client.send(deleteCommand);

            return {
                success: true,
                physicalId,
                resourceType,
            };
        } catch (error) {
            return {
                success: false,
                physicalId,
                resourceType,
                error: error.name || error.Code || error.message,
                message: error.message,
                retryable: this._isRetryableError(error),
            };
        }
    }

    async deleteResourceBatch(resources, progressCallback) {
        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            const result = await this.deleteResource(resource);

            results.push(result);

            if (result.success) {
                successCount++;
            } else {
                failedCount++;
            }

            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: resources.length,
                    physicalId: resource.physicalId,
                    resourceType: resource.resourceType,
                    success: result.success,
                    error: result.error,
                });
            }
        }

        return {
            successCount,
            failedCount,
            results,
        };
    }

    _getDeleteCommand(resourceType, physicalId) {
        const {
            DeleteVpcCommand,
            DeleteSubnetCommand,
            DeleteSecurityGroupCommand,
            DeleteNatGatewayCommand,
            DeleteInternetGatewayCommand,
            DeleteRouteTableCommand,
            DeleteVpcEndpointsCommand,
        } = this._loadEC2Commands();

        switch (resourceType) {
            case 'AWS::EC2::VPC':
                return new DeleteVpcCommand({ VpcId: physicalId });
            case 'AWS::EC2::Subnet':
                return new DeleteSubnetCommand({ SubnetId: physicalId });
            case 'AWS::EC2::SecurityGroup':
                return new DeleteSecurityGroupCommand({ GroupId: physicalId });
            case 'AWS::EC2::NatGateway':
                return new DeleteNatGatewayCommand({ NatGatewayId: physicalId });
            case 'AWS::EC2::InternetGateway':
                return new DeleteInternetGatewayCommand({ InternetGatewayId: physicalId });
            case 'AWS::EC2::RouteTable':
                return new DeleteRouteTableCommand({ RouteTableId: physicalId });
            case 'AWS::EC2::VPCEndpoint':
                return new DeleteVpcEndpointsCommand({ VpcEndpointIds: [physicalId] });
            default:
                return null;
        }
    }

    _isRetryableError(error) {
        const retryableErrors = [
            'DependencyViolation',
            'RequestLimitExceeded',
            'ThrottlingException',
            'ServiceUnavailable',
        ];

        const errorCode = error.name || error.Code || '';
        return retryableErrors.some((retryable) => errorCode.includes(retryable));
    }

    _loadEC2Commands() {
        const ec2 = require('@aws-sdk/client-ec2');
        return {
            DeleteVpcCommand: ec2.DeleteVpcCommand,
            DeleteSubnetCommand: ec2.DeleteSubnetCommand,
            DeleteSecurityGroupCommand: ec2.DeleteSecurityGroupCommand,
            DeleteNatGatewayCommand: ec2.DeleteNatGatewayCommand,
            DeleteInternetGatewayCommand: ec2.DeleteInternetGatewayCommand,
            DeleteRouteTableCommand: ec2.DeleteRouteTableCommand,
            DeleteVpcEndpointsCommand: ec2.DeleteVpcEndpointsCommand,
        };
    }
}

module.exports = ResourceDeleterRepository;
