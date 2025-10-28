/**
 * Property Mutability Configuration
 *
 * Defines which CloudFormation resource properties are immutable (require replacement),
 * mutable (can be updated), or conditional (depends on other properties).
 *
 * Based on AWS CloudFormation documentation "Update requires" behavior:
 * - IMMUTABLE: "Replacement" - Cannot be changed without replacing the resource
 * - MUTABLE: "No interruption" or "Some interruptions" - Can be updated in place
 * - CONDITIONAL: Depends on other property values or specific conditions
 *
 * References:
 * - AWS CloudFormation Template Reference: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/
 * - Each resource type has "Update requires" documentation for each property
 */

const PropertyMutability = require('../value-objects/property-mutability');

/**
 * Property mutability configuration by resource type
 *
 * Key: CloudFormation resource type (e.g., 'AWS::Lambda::Function')
 * Value: Object mapping property paths to PropertyMutability instances
 *
 * Property paths match AWS drift detection format (without 'Properties.' prefix):
 * - Simple: 'BucketName'
 * - Nested: 'VpcConfig.SubnetIds'
 */
const PROPERTY_MUTABILITY_CONFIG = {
    //
    // AWS::EC2::* Resources
    //

    'AWS::EC2::VPC': {
        // Immutable properties
        'CidrBlock': PropertyMutability.IMMUTABLE, // Replacement required
        'InstanceTenancy': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'EnableDnsSupport': PropertyMutability.MUTABLE, // No interruption
        'EnableDnsHostnames': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    'AWS::EC2::Subnet': {
        // Immutable properties
        'VpcId': PropertyMutability.IMMUTABLE, // Replacement required
        'CidrBlock': PropertyMutability.IMMUTABLE, // Replacement required
        'AvailabilityZone': PropertyMutability.IMMUTABLE, // Replacement required
        'AvailabilityZoneId': PropertyMutability.IMMUTABLE, // Replacement required
        'Ipv4IpamPoolId': PropertyMutability.IMMUTABLE, // Replacement required
        'Ipv4NetmaskLength': PropertyMutability.IMMUTABLE, // Replacement required
        'Ipv6IpamPoolId': PropertyMutability.IMMUTABLE, // Replacement required
        'Ipv6Native': PropertyMutability.IMMUTABLE, // Replacement required
        'Ipv6NetmaskLength': PropertyMutability.IMMUTABLE, // Replacement required
        'OutpostArn': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'AssignIpv6AddressOnCreation': PropertyMutability.MUTABLE, // No interruption
        'EnableDns64': PropertyMutability.MUTABLE, // No interruption
        'EnableLniAtDeviceIndex': PropertyMutability.MUTABLE, // No interruption
        'Ipv6CidrBlock': PropertyMutability.MUTABLE, // Some interruptions
        'MapPublicIpOnLaunch': PropertyMutability.MUTABLE, // No interruption
        'PrivateDnsNameOptionsOnLaunch': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    'AWS::EC2::SecurityGroup': {
        // Immutable properties
        'VpcId': PropertyMutability.IMMUTABLE, // Replacement required
        'GroupName': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'GroupDescription': PropertyMutability.MUTABLE, // No interruption
        'SecurityGroupIngress': PropertyMutability.MUTABLE, // No interruption
        'SecurityGroupEgress': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    'AWS::EC2::RouteTable': {
        // Immutable properties
        'VpcId': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    'AWS::EC2::Instance': {
        // Immutable properties
        'ImageId': PropertyMutability.IMMUTABLE, // Replacement required
        'InstanceType': PropertyMutability.IMMUTABLE, // Replacement required
        'KeyName': PropertyMutability.IMMUTABLE, // Replacement required
        'AvailabilityZone': PropertyMutability.IMMUTABLE, // Replacement required
        'PlacementGroupName': PropertyMutability.IMMUTABLE, // Replacement required
        'PrivateIpAddress': PropertyMutability.IMMUTABLE, // Replacement required
        'SubnetId': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'SecurityGroupIds': PropertyMutability.MUTABLE, // No interruption (VPC instances)
        'SecurityGroups': PropertyMutability.MUTABLE, // No interruption
        'UserData': PropertyMutability.MUTABLE, // Some interruptions
        'IamInstanceProfile': PropertyMutability.MUTABLE, // No interruption
        'Monitoring': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'DisableApiTermination': PropertyMutability.MUTABLE, // No interruption
        'EbsOptimized': PropertyMutability.MUTABLE, // Some interruptions
    },

    //
    // AWS::Lambda::* Resources
    //

    'AWS::Lambda::Function': {
        // Immutable properties
        'FunctionName': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'Code': PropertyMutability.MUTABLE, // No interruption
        'Runtime': PropertyMutability.MUTABLE, // No interruption
        'Handler': PropertyMutability.MUTABLE, // No interruption
        'Role': PropertyMutability.MUTABLE, // No interruption
        'Description': PropertyMutability.MUTABLE, // No interruption
        'Timeout': PropertyMutability.MUTABLE, // No interruption
        'MemorySize': PropertyMutability.MUTABLE, // No interruption
        'Environment': PropertyMutability.MUTABLE, // No interruption
        'Environment.Variables': PropertyMutability.MUTABLE, // No interruption
        'VpcConfig': PropertyMutability.MUTABLE, // No interruption
        'VpcConfig.SubnetIds': PropertyMutability.MUTABLE, // No interruption
        'VpcConfig.SecurityGroupIds': PropertyMutability.MUTABLE, // No interruption
        'VpcConfig.Ipv6AllowedForDualStack': PropertyMutability.MUTABLE, // No interruption
        'DeadLetterConfig': PropertyMutability.MUTABLE, // No interruption
        'TracingConfig': PropertyMutability.MUTABLE, // No interruption
        'KMSKeyArn': PropertyMutability.MUTABLE, // No interruption
        'Layers': PropertyMutability.MUTABLE, // No interruption
        'ReservedConcurrentExecutions': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'FileSystemConfigs': PropertyMutability.MUTABLE, // No interruption
        'Architectures': PropertyMutability.MUTABLE, // No interruption
        'EphemeralStorage': PropertyMutability.MUTABLE, // No interruption
        'SnapStart': PropertyMutability.MUTABLE, // No interruption
        'RuntimeManagementConfig': PropertyMutability.MUTABLE, // No interruption
        'LoggingConfig': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::RDS::* Resources
    //

    'AWS::RDS::DBInstance': {
        // Immutable properties
        'DBInstanceIdentifier': PropertyMutability.IMMUTABLE, // Replacement required
        'Engine': PropertyMutability.IMMUTABLE, // Replacement required
        'DBName': PropertyMutability.IMMUTABLE, // Replacement required (for some engines)
        'AvailabilityZone': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'AllocatedStorage': PropertyMutability.MUTABLE, // No interruption
        'DBInstanceClass': PropertyMutability.MUTABLE, // Some interruptions
        'EngineVersion': PropertyMutability.MUTABLE, // Some interruptions
        'MasterUsername': PropertyMutability.MUTABLE, // No interruption (can't actually change)
        'MasterUserPassword': PropertyMutability.MUTABLE, // No interruption
        'BackupRetentionPeriod': PropertyMutability.MUTABLE, // No interruption
        'DBSecurityGroups': PropertyMutability.MUTABLE, // No interruption
        'VPCSecurityGroups': PropertyMutability.MUTABLE, // No interruption
        'MultiAZ': PropertyMutability.MUTABLE, // No interruption
        'PubliclyAccessible': PropertyMutability.MUTABLE, // No interruption
        'StorageEncrypted': PropertyMutability.MUTABLE, // Some interruptions
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    'AWS::RDS::DBCluster': {
        // Immutable properties
        'DBClusterIdentifier': PropertyMutability.IMMUTABLE, // Replacement required
        'Engine': PropertyMutability.IMMUTABLE, // Replacement required
        'DatabaseName': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'EngineVersion': PropertyMutability.MUTABLE, // No interruption
        'MasterUsername': PropertyMutability.MUTABLE, // No interruption (can't actually change)
        'MasterUserPassword': PropertyMutability.MUTABLE, // No interruption
        'BackupRetentionPeriod': PropertyMutability.MUTABLE, // No interruption
        'PreferredBackupWindow': PropertyMutability.MUTABLE, // No interruption
        'PreferredMaintenanceWindow': PropertyMutability.MUTABLE, // No interruption
        'VpcSecurityGroupIds': PropertyMutability.MUTABLE, // No interruption
        'DBSubnetGroupName': PropertyMutability.MUTABLE, // Some interruptions
        'StorageEncrypted': PropertyMutability.MUTABLE, // Some interruptions
        'KmsKeyId': PropertyMutability.MUTABLE, // Some interruptions
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::S3::* Resources
    //

    'AWS::S3::Bucket': {
        // Immutable properties
        'BucketName': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'AccelerateConfiguration': PropertyMutability.MUTABLE, // No interruption
        'AccessControl': PropertyMutability.MUTABLE, // No interruption
        'AnalyticsConfigurations': PropertyMutability.MUTABLE, // No interruption
        'BucketEncryption': PropertyMutability.MUTABLE, // No interruption
        'CorsConfiguration': PropertyMutability.MUTABLE, // No interruption
        'IntelligentTieringConfigurations': PropertyMutability.MUTABLE, // No interruption
        'InventoryConfigurations': PropertyMutability.MUTABLE, // No interruption
        'LifecycleConfiguration': PropertyMutability.MUTABLE, // No interruption
        'LoggingConfiguration': PropertyMutability.MUTABLE, // No interruption
        'MetricsConfigurations': PropertyMutability.MUTABLE, // No interruption
        'NotificationConfiguration': PropertyMutability.MUTABLE, // No interruption
        'ObjectLockConfiguration': PropertyMutability.MUTABLE, // No interruption
        'ObjectLockEnabled': PropertyMutability.MUTABLE, // No interruption
        'OwnershipControls': PropertyMutability.MUTABLE, // No interruption
        'PublicAccessBlockConfiguration': PropertyMutability.MUTABLE, // No interruption
        'ReplicationConfiguration': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'VersioningConfiguration': PropertyMutability.MUTABLE, // No interruption
        'WebsiteConfiguration': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::KMS::* Resources
    //

    'AWS::KMS::Key': {
        // All KMS key properties are mutable (updates don't require replacement)
        'Description': PropertyMutability.MUTABLE, // No interruption
        'Enabled': PropertyMutability.MUTABLE, // No interruption
        'EnableKeyRotation': PropertyMutability.MUTABLE, // No interruption
        'KeyPolicy': PropertyMutability.MUTABLE, // No interruption
        'KeyUsage': PropertyMutability.MUTABLE, // No interruption
        'MultiRegion': PropertyMutability.MUTABLE, // No interruption
        'PendingWindowInDays': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::DynamoDB::* Resources
    //

    'AWS::DynamoDB::Table': {
        // Immutable properties
        'TableName': PropertyMutability.IMMUTABLE, // Replacement required
        'KeySchema': PropertyMutability.IMMUTABLE, // Replacement required
        'AttributeDefinitions': PropertyMutability.CONDITIONAL, // Some changes require replacement

        // Mutable properties
        'BillingMode': PropertyMutability.MUTABLE, // No interruption
        'ProvisionedThroughput': PropertyMutability.MUTABLE, // No interruption
        'GlobalSecondaryIndexes': PropertyMutability.MUTABLE, // No interruption
        'LocalSecondaryIndexes': PropertyMutability.IMMUTABLE, // Replacement required
        'StreamSpecification': PropertyMutability.MUTABLE, // No interruption
        'SSESpecification': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'TimeToLiveSpecification': PropertyMutability.MUTABLE, // No interruption
        'PointInTimeRecoverySpecification': PropertyMutability.MUTABLE, // No interruption
        'ContributorInsightsSpecification': PropertyMutability.MUTABLE, // No interruption
        'KinesisStreamSpecification': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::SQS::* Resources
    //

    'AWS::SQS::Queue': {
        // Immutable properties
        'QueueName': PropertyMutability.IMMUTABLE, // Replacement required
        'FifoQueue': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'ContentBasedDeduplication': PropertyMutability.MUTABLE, // No interruption
        'DeduplicationScope': PropertyMutability.MUTABLE, // No interruption
        'DelaySeconds': PropertyMutability.MUTABLE, // No interruption
        'FifoThroughputLimit': PropertyMutability.MUTABLE, // No interruption
        'KmsMasterKeyId': PropertyMutability.MUTABLE, // No interruption
        'KmsDataKeyReusePeriodSeconds': PropertyMutability.MUTABLE, // No interruption
        'MaximumMessageSize': PropertyMutability.MUTABLE, // No interruption
        'MessageRetentionPeriod': PropertyMutability.MUTABLE, // No interruption
        'ReceiveMessageWaitTimeSeconds': PropertyMutability.MUTABLE, // No interruption
        'RedrivePolicy': PropertyMutability.MUTABLE, // No interruption
        'RedriveAllowPolicy': PropertyMutability.MUTABLE, // No interruption
        'SqsManagedSseEnabled': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'VisibilityTimeout': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::SNS::* Resources
    //

    'AWS::SNS::Topic': {
        // Immutable properties
        'TopicName': PropertyMutability.IMMUTABLE, // Replacement required
        'FifoTopic': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'ContentBasedDeduplication': PropertyMutability.MUTABLE, // No interruption
        'DataProtectionPolicy': PropertyMutability.MUTABLE, // No interruption
        'DisplayName': PropertyMutability.MUTABLE, // No interruption
        'KmsMasterKeyId': PropertyMutability.MUTABLE, // No interruption
        'SignatureVersion': PropertyMutability.MUTABLE, // No interruption
        'Subscription': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
        'TracingConfig': PropertyMutability.MUTABLE, // No interruption
    },

    //
    // AWS::IAM::* Resources
    //

    'AWS::IAM::Role': {
        // Immutable properties
        'RoleName': PropertyMutability.IMMUTABLE, // Replacement required

        // Mutable properties
        'AssumeRolePolicyDocument': PropertyMutability.MUTABLE, // No interruption
        'Description': PropertyMutability.MUTABLE, // No interruption
        'ManagedPolicyArns': PropertyMutability.MUTABLE, // No interruption
        'MaxSessionDuration': PropertyMutability.MUTABLE, // No interruption
        'Path': PropertyMutability.MUTABLE, // No interruption
        'PermissionsBoundary': PropertyMutability.MUTABLE, // No interruption
        'Policies': PropertyMutability.MUTABLE, // No interruption
        'Tags': PropertyMutability.MUTABLE, // No interruption
    },
};

/**
 * Get property mutability for a given resource type and property path
 *
 * @param {string} resourceType - CloudFormation resource type (e.g., 'AWS::Lambda::Function')
 * @param {string} propertyPath - Property path from drift detection (e.g., 'VpcConfig.SubnetIds')
 * @returns {PropertyMutability} Property mutability (defaults to MUTABLE if not found)
 */
function getPropertyMutability(resourceType, propertyPath) {
    // Check if resource type has configuration
    if (!PROPERTY_MUTABILITY_CONFIG[resourceType]) {
        // Unknown resource type - default to MUTABLE (safe, allows reconciliation attempt)
        return PropertyMutability.MUTABLE;
    }

    const resourceConfig = PROPERTY_MUTABILITY_CONFIG[resourceType];

    // Check exact property path match
    if (resourceConfig[propertyPath]) {
        return resourceConfig[propertyPath];
    }

    // Check parent property for nested paths (e.g., 'VpcConfig' for 'VpcConfig.SubnetIds')
    const parentPath = propertyPath.split('.')[0];
    if (resourceConfig[parentPath]) {
        return resourceConfig[parentPath];
    }

    // Property not found in config - default to MUTABLE
    return PropertyMutability.MUTABLE;
}

/**
 * Check if a resource type is supported in the configuration
 *
 * @param {string} resourceType - CloudFormation resource type
 * @returns {boolean} True if resource type is configured
 */
function isResourceTypeConfigured(resourceType) {
    return resourceType in PROPERTY_MUTABILITY_CONFIG;
}

/**
 * Get all configured resource types
 *
 * @returns {string[]} Array of resource type names
 */
function getConfiguredResourceTypes() {
    return Object.keys(PROPERTY_MUTABILITY_CONFIG);
}

module.exports = {
    PROPERTY_MUTABILITY_CONFIG,
    getPropertyMutability,
    isResourceTypeConfigured,
    getConfiguredResourceTypes,
};
