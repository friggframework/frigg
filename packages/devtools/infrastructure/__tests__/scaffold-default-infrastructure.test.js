/**
 * The app scaffolded by `frigg init` must deploy with no always-on AWS cost.
 *
 * Scaffolds the backend template, loads its Definition and composes it the way
 * `frigg deploy` does (AWS discovery stubbed), then asserts the template has
 * no VPC, NAT gateway, Elastic IP, VPC endpoint or RDS/Aurora resource, that
 * no Lambda is attached to a VPC, and that field-level encryption still gets
 * its KMS key.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');

jest.mock('../domains/shared/resource-discovery', () => ({
    ...jest.requireActual('../domains/shared/resource-discovery'),
    gatherDiscoveredResources: jest.fn(),
}));
jest.mock('../domains/shared/utilities/prisma-layer-manager', () => ({
    ensurePrismaLayerExists: jest.fn().mockResolvedValue(undefined),
}));

const {
    gatherDiscoveredResources,
} = require('../domains/shared/resource-discovery');
const { composeServerlessDefinition } = require('../infrastructure-composer');
const BackendFirstHandler = require('../../frigg-cli/init-command/backend-first-handler');

const FORBIDDEN_RESOURCE_TYPES = [
    'AWS::EC2::VPC',
    'AWS::EC2::NatGateway',
    'AWS::EC2::EIP',
    'AWS::EC2::VPCEndpoint',
    'AWS::RDS::DBCluster',
    'AWS::RDS::DBInstance',
    'AWS::RDS::DBSubnetGroup',
];

// An account that already holds a default VPC, subnets, a NAT gateway and an
// Aurora cluster: none of it may leak into the scaffolded app's template.
const BUSY_ACCOUNT_DISCOVERY = {
    defaultVpcId: 'vpc-123456',
    vpcCidr: '172.31.0.0/16',
    defaultSecurityGroupId: 'sg-123456',
    privateSubnetId1: 'subnet-123456',
    privateSubnetId2: 'subnet-789012',
    publicSubnetId1: 'subnet-public-1',
    publicSubnetId2: 'subnet-public-2',
    defaultRouteTableId: 'rtb-123456',
    existingNatGatewayId: 'nat-default123',
    auroraClusterEndpoint: 'c.cluster-abc123.us-east-1.rds.amazonaws.com',
    auroraPort: 5432,
    auroraEngine: 'aurora-postgresql',
};

describe('frigg init default infrastructure', () => {
    let tmpDir;
    let Definition;
    let logSpy;

    beforeAll(async () => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-default-infra-'));
        const target = path.join(tmpDir, 'demo-app');
        await new BackendFirstHandler(target, {
            yes: true,
            install: false,
            git: false,
        }).initialize();
        ({ Definition } = require(path.join(target, 'index.js')));
    });

    afterAll(() => {
        fs.removeSync(tmpDir);
        logSpy.mockRestore();
    });

    beforeEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        process.argv = ['node', 'test'];
    });

    const compose = async (discovery) => {
        gatherDiscoveredResources.mockResolvedValue(discovery);
        // The composer mutates nested parts of the definition.
        return composeServerlessDefinition(
            JSON.parse(JSON.stringify(Definition))
        );
    };

    const resourceTypes = (definition) =>
        Object.values(definition.resources.Resources).map((r) => r.Type);

    it('passes the app-definition schema', () => {
        const { validateAppDefinition } = require('@friggframework/schemas');
        expect(validateAppDefinition(Definition).valid).toBe(true);
    });

    it.each([
        ['an empty account', {}],
        ['an account with existing VPC/NAT/Aurora', BUSY_ACCOUNT_DISCOVERY],
    ])('composes no always-on resources in %s', async (_label, discovery) => {
        const definition = await compose(discovery);
        const types = resourceTypes(definition);

        for (const forbidden of FORBIDDEN_RESOURCE_TYPES) {
            expect(types).not.toContain(forbidden);
        }

        // No Lambda is attached to a VPC.
        expect(definition.provider.vpc).toBeUndefined();
        for (const fn of Object.values(definition.functions)) {
            expect(fn.vpc).toBeUndefined();
        }
        for (const resource of Object.values(definition.resources.Resources)) {
            expect(resource.Properties?.VpcConfig).toBeUndefined();
        }
    });

    it('keeps field-level encryption on with a per-stage KMS key', async () => {
        const definition = await compose({});

        expect(definition.resources.Resources.FriggKMSKey.Type).toBe(
            'AWS::KMS::Key'
        );
        expect(definition.provider.environment.KMS_KEY_ARN).toEqual({
            'Fn::GetAtt': ['FriggKMSKey', 'Arn'],
        });
    });

    it('connects to the external database through DATABASE_URL', async () => {
        const definition = await compose({});

        expect(definition.provider.environment.DATABASE_URL).toBe(
            "${env:DATABASE_URL, ''}"
        );
        expect(definition.provider.environment.DB_TYPE).toBe('postgresql');
        expect(definition.resources.Resources.FriggDBSecret).toBeUndefined();
    });

    it('expires Lambda logs after 14 days', async () => {
        // Without provider.logRetentionInDays, osls creates log groups that
        // never expire, so CloudWatch storage grows forever.
        const definition = await compose({});

        expect(definition.provider.logRetentionInDays).toBe(14);
    });
});
