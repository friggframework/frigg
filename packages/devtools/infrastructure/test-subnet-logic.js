#!/usr/bin/env node

/**
 * Test script to verify subnet detection and classification logic
 */

const { AWSDiscovery } = require('./aws-discovery');

async function testSubnetLogic() {
    console.log('🧪 Testing Subnet Detection and Classification Logic');
    console.log('═'.repeat(60));

    try {
        const discovery = new AWSDiscovery();

        // Test with selfHeal enabled
        console.log('\n📋 Testing with selfHeal: true');
        console.log('-'.repeat(40));

        const resources = await discovery.discoverResources({ selfHeal: true });

        console.log('\n📊 Results:');
        console.log(`  VPC ID: ${resources.defaultVpcId}`);
        console.log(`  Private Subnet 1: ${resources.privateSubnetId1}`);
        console.log(`  Private Subnet 2: ${resources.privateSubnetId2}`);
        console.log(`  Public Subnet: ${resources.publicSubnetId}`);
        console.log(`  Conversion Required: ${resources.subnetConversionRequired}`);

        if (resources.privateSubnetsWithWrongRoutes && resources.privateSubnetsWithWrongRoutes.length > 0) {
            console.log(`\n⚠️  Subnets needing conversion:`);
            resources.privateSubnetsWithWrongRoutes.forEach(subnet => {
                console.log(`    - ${subnet}`);
            });
        }

        console.log('\n✅ Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testSubnetLogic().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});