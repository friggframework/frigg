const ResourceDeleterRepository = require('./resource-deleter-repository');

describe('ResourceDeleterRepository', () => {
    let repository;
    let mockEc2Client;

    beforeEach(() => {
        mockEc2Client = {
            send: jest.fn(),
        };

        repository = new ResourceDeleterRepository({
            ec2Client: mockEc2Client,
            region: 'us-east-1',
        });
    });

    describe('constructor', () => {
        it('should initialize with default region', () => {
            const repo = new ResourceDeleterRepository({
                ec2Client: mockEc2Client,
            });

            expect(repo.region).toBe('us-east-1');
        });

        it('should initialize with provided region', () => {
            const repo = new ResourceDeleterRepository({
                ec2Client: mockEc2Client,
                region: 'eu-west-1',
            });

            expect(repo.region).toBe('eu-west-1');
        });
    });

    describe('deleteResource', () => {
        it('should delete VPC successfully', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const result = await repository.deleteResource({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(result.success).toBe(true);
            expect(result.physicalId).toBe('vpc-123');
            expect(mockEc2Client.send).toHaveBeenCalledTimes(1);
        });

        it('should delete Subnet successfully', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const result = await repository.deleteResource({
                physicalId: 'subnet-123',
                resourceType: 'AWS::EC2::Subnet',
            });

            expect(result.success).toBe(true);
            expect(result.physicalId).toBe('subnet-123');
        });

        it('should delete SecurityGroup successfully', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const result = await repository.deleteResource({
                physicalId: 'sg-123',
                resourceType: 'AWS::EC2::SecurityGroup',
            });

            expect(result.success).toBe(true);
            expect(result.physicalId).toBe('sg-123');
        });

        it('should handle DependencyViolation error gracefully', async () => {
            const error = new Error('DependencyViolation');
            error.name = 'DependencyViolation';
            error.Code = 'DependencyViolation';
            mockEc2Client.send.mockRejectedValue(error);

            const result = await repository.deleteResource({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('DependencyViolation');
            expect(result.retryable).toBe(true);
        });

        it('should handle ResourceNotFound error', async () => {
            const error = new Error('InvalidVpcID.NotFound');
            error.name = 'InvalidVpcID.NotFound';
            mockEc2Client.send.mockRejectedValue(error);

            const result = await repository.deleteResource({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('InvalidVpcID.NotFound');
            expect(result.retryable).toBe(false);
        });

        it('should handle UnauthorizedOperation error', async () => {
            const error = new Error('UnauthorizedOperation');
            error.name = 'UnauthorizedOperation';
            mockEc2Client.send.mockRejectedValue(error);

            const result = await repository.deleteResource({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('UnauthorizedOperation');
            expect(result.retryable).toBe(false);
        });

        it('should handle unsupported resource type', async () => {
            const result = await repository.deleteResource({
                physicalId: 'resource-123',
                resourceType: 'AWS::S3::Bucket',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported resource type');
            expect(mockEc2Client.send).not.toHaveBeenCalled();
        });
    });

    describe('deleteResourceBatch', () => {
        it('should delete multiple resources successfully', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet' },
                { physicalId: 'subnet-456', resourceType: 'AWS::EC2::Subnet' },
            ];

            const result = await repository.deleteResourceBatch(resources);

            expect(result.successCount).toBe(2);
            expect(result.failedCount).toBe(0);
            expect(result.results).toHaveLength(2);
            expect(mockEc2Client.send).toHaveBeenCalledTimes(2);
        });

        it('should handle partial failures', async () => {
            mockEc2Client.send
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('DependencyViolation'));

            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet' },
                { physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' },
            ];

            const result = await repository.deleteResourceBatch(resources);

            expect(result.successCount).toBe(1);
            expect(result.failedCount).toBe(1);
            expect(result.results[0].success).toBe(true);
            expect(result.results[1].success).toBe(false);
        });

        it('should delete resources sequentially for safety', async () => {
            const deletionOrder = [];
            mockEc2Client.send.mockImplementation((command) => {
                deletionOrder.push(command.input.SubnetId || command.input.VpcId);
                return Promise.resolve({});
            });

            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet' },
                { physicalId: 'vpc-456', resourceType: 'AWS::EC2::VPC' },
            ];

            await repository.deleteResourceBatch(resources);

            expect(deletionOrder).toEqual(['subnet-123', 'vpc-456']);
        });

        it('should handle empty batch', async () => {
            const result = await repository.deleteResourceBatch([]);

            expect(result.successCount).toBe(0);
            expect(result.failedCount).toBe(0);
            expect(result.results).toHaveLength(0);
        });
    });

    describe('VPC deletion', () => {
        it('should use DeleteVpcCommand with correct parameters', async () => {
            mockEc2Client.send.mockResolvedValue({});

            await repository.deleteResource({
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
            });

            expect(mockEc2Client.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: { VpcId: 'vpc-123' },
                })
            );
        });
    });

    describe('Subnet deletion', () => {
        it('should use DeleteSubnetCommand with correct parameters', async () => {
            mockEc2Client.send.mockResolvedValue({});

            await repository.deleteResource({
                physicalId: 'subnet-123',
                resourceType: 'AWS::EC2::Subnet',
            });

            expect(mockEc2Client.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: { SubnetId: 'subnet-123' },
                })
            );
        });
    });

    describe('SecurityGroup deletion', () => {
        it('should use DeleteSecurityGroupCommand with correct parameters', async () => {
            mockEc2Client.send.mockResolvedValue({});

            await repository.deleteResource({
                physicalId: 'sg-123',
                resourceType: 'AWS::EC2::SecurityGroup',
            });

            expect(mockEc2Client.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: { GroupId: 'sg-123' },
                })
            );
        });
    });

    describe('progress callback', () => {
        it('should invoke progress callback during batch deletion', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const progressCallback = jest.fn();
            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet' },
                { physicalId: 'subnet-456', resourceType: 'AWS::EC2::Subnet' },
            ];

            await repository.deleteResourceBatch(resources, progressCallback);

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    current: 1,
                    total: 2,
                    physicalId: 'subnet-123',
                    success: true,
                })
            );

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    current: 2,
                    total: 2,
                    physicalId: 'subnet-456',
                    success: true,
                })
            );
        });

        it('should not fail if progress callback is not provided', async () => {
            mockEc2Client.send.mockResolvedValue({});

            const resources = [
                { physicalId: 'subnet-123', resourceType: 'AWS::EC2::Subnet' },
            ];

            await expect(repository.deleteResourceBatch(resources)).resolves.toBeDefined();
        });
    });
});
