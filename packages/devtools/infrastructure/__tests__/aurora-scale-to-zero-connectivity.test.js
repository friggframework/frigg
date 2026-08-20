/**
 * ADR-033: Aurora Serverless v2 scale-to-zero + NAT-free public connectivity
 *
 * These tests assert on the GENERATED CloudFormation template (via the full
 * composer) plus the AuroraBuilder validator. They are deterministic and require
 * neither a live AWS account nor Prisma client generation:
 *   - Validator cases call AuroraBuilder.validate() directly (pure, no I/O).
 *   - Template cases use vpc.management='create-new' + database.postgres
 *     management='managed', which resolve to STACK ownership without depending on
 *     any discovered AWS resource, so cloud discovery returning empty is fine.
 *
 * Both new capabilities are opt-in and default-off; the final describe block
 * guards the no-regression promise: a default (vpc, no minCapacity) definition
 * composes the same template as before.
 */

const { composeServerlessDefinition } = require('../infrastructure-composer');
const { AuroraBuilder } = require('../domains/database/aurora-builder');

// Shared: an app definition that creates a fresh VPC + a Frigg-owned Aurora
// cluster in-stack, with overridable postgres config.
function makeApp(postgresOverrides = {}) {
    return {
        name: 'adr033-app',
        provider: 'aws',
        region: 'us-east-1',
        integrations: [],
        vpc: { enable: true, management: 'create-new' },
        database: {
            postgres: {
                enable: true,
                management: 'managed',
                ...postgresOverrides,
            },
        },
    };
}

function findResources(template, predicate) {
    return Object.entries(template.resources.Resources).filter(([, r]) => predicate(r));
}

describe('ADR-033: Aurora scale-to-zero + connectivity', () => {
    beforeAll(() => {
        process.env.AWS_REGION = 'us-east-1';
        // Intentionally NOT setting FRIGG_SKIP_AWS_DISCOVERY — the builders must
        // execute. create-new/managed resolve to STACK without needing discovery.
    });

    afterAll(() => {
        delete process.env.AWS_REGION;
    });

    // ---------------------------------------------------------------------
    // Validator
    // ---------------------------------------------------------------------
    describe('validator (AuroraBuilder.validate)', () => {
        const build = new AuroraBuilder();
        // ValidationResult exposes hasErrors(); "valid" means no errors.
        const validateResult = (postgres) =>
            build.validate({ database: { postgres: { enable: true, ...postgres } } });
        const isValid = (postgres) => !validateResult(postgres).hasErrors();

        test('accepts minCapacity: 0 (scale-to-zero)', () => {
            expect(isValid({ minCapacity: 0 })).toBe(true);
        });

        test('rejects minCapacity: 0.3 (inside the forbidden (0, 0.5) band)', () => {
            const r = validateResult({ minCapacity: 0.3 });
            expect(r.hasErrors()).toBe(true);
            expect(r.errors.join(' ')).toMatch(/minCapacity must be 0 \(scale-to-zero\) or between 0\.5 and 128/);
        });

        test('accepts minCapacity: 0.5 and minCapacity: 64', () => {
            expect(isValid({ minCapacity: 0.5 })).toBe(true);
            expect(isValid({ minCapacity: 64 })).toBe(true);
        });

        test('rejects secondsUntilAutoPause: 100 (below 300)', () => {
            const r = validateResult({ minCapacity: 0, secondsUntilAutoPause: 100 });
            expect(r.hasErrors()).toBe(true);
            expect(r.errors.join(' ')).toMatch(/secondsUntilAutoPause must be an integer between 300 and 86400/);
        });

        test('accepts secondsUntilAutoPause: 3600', () => {
            expect(isValid({ minCapacity: 0, secondsUntilAutoPause: 3600 })).toBe(true);
        });

        test("accepts connectivity: 'public'", () => {
            expect(isValid({ connectivity: 'public' })).toBe(true);
        });

        test("rejects connectivity: 'nope'", () => {
            const r = validateResult({ connectivity: 'nope' });
            expect(r.hasErrors()).toBe(true);
            expect(r.errors.join(' ')).toMatch(/Invalid database\.postgres\.connectivity/);
        });

        test('rejects non-array / non-CIDR allowedCidrs, accepts valid CIDRs', () => {
            expect(isValid({ allowedCidrs: 'nope' })).toBe(false);
            expect(isValid({ allowedCidrs: ['not-a-cidr'] })).toBe(false);
            expect(isValid({ allowedCidrs: ['10.0.0.0/8', '203.0.113.5/32'] })).toBe(true);
        });

        test('warns (does not fail) when minCapacity:0 with an older pinned engine version', () => {
            const r = validateResult({ minCapacity: 0, engineVersion: '15.4' });
            expect(r.hasErrors()).toBe(false); // warning, not error
            expect(r.warnings.join(' ')).toMatch(/may not support .*scale-to-zero/);
        });

        test('does not warn about engine when minCapacity:0 on a capable version', () => {
            const r = validateResult({ minCapacity: 0, engineVersion: '15.13' });
            expect(r.warnings.join(' ')).not.toMatch(/may not support .*scale-to-zero/);
        });
    });

    // ---------------------------------------------------------------------
    // Scale-to-zero (template shape)
    // ---------------------------------------------------------------------
    describe('scale-to-zero (minCapacity: 0)', () => {
        test('MinCapacity is exactly 0 and SecondsUntilAutoPause defaults to 300', async () => {
            const t = await composeServerlessDefinition(makeApp({ minCapacity: 0 }));
            const scaling = t.resources.Resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;

            // Mutation guard: with the old `|| 0.5` bug this would be 0.5, not 0.
            expect(scaling.MinCapacity).toBe(0);
            expect(scaling.MinCapacity).not.toBe(0.5);
            expect(scaling.SecondsUntilAutoPause).toBe(300);
        });

        test('SecondsUntilAutoPause honors a custom value', async () => {
            const t = await composeServerlessDefinition(makeApp({ minCapacity: 0, secondsUntilAutoPause: 1800 }));
            const scaling = t.resources.Resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBe(0);
            expect(scaling.SecondsUntilAutoPause).toBe(1800);
        });

        test('MaxCapacity defaults to 4 and is preserved with scale-to-zero', async () => {
            const t = await composeServerlessDefinition(makeApp({ minCapacity: 0 }));
            const scaling = t.resources.Resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MaxCapacity).toBe(4);
        });
    });

    // ---------------------------------------------------------------------
    // Public connectivity (template shape)
    // ---------------------------------------------------------------------
    describe("connectivity: 'public'", () => {
        test('Aurora ingress uses CidrIp — one rule per allowedCidr — not SourceSecurityGroupId', async () => {
            const t = await composeServerlessDefinition(
                makeApp({ connectivity: 'public', allowedCidrs: ['10.1.0.0/16', '203.0.113.7/32'] })
            );
            const ingress = findResources(
                t,
                (r) => r.Type === 'AWS::EC2::SecurityGroupIngress' && r.Properties.FromPort === 5432
            );
            expect(ingress).toHaveLength(2);
            const cidrs = ingress.map(([, r]) => r.Properties.CidrIp).sort();
            expect(cidrs).toEqual(['10.1.0.0/16', '203.0.113.7/32']);
            ingress.forEach(([, r]) => {
                expect(r.Properties.CidrIp).toBeDefined();
                expect(r.Properties.SourceSecurityGroupId).toBeUndefined();
            });
        });

        test('allowedCidrs defaults to 0.0.0.0/0 when omitted', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public' }));
            const ingress = findResources(
                t,
                (r) => r.Type === 'AWS::EC2::SecurityGroupIngress' && r.Properties.FromPort === 5432
            );
            expect(ingress).toHaveLength(1);
            expect(ingress[0][1].Properties.CidrIp).toBe('0.0.0.0/0');
        });

        test('Aurora instance is PubliclyAccessible and cluster sits in public subnets', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public' }));
            expect(t.resources.Resources.FriggAuroraInstance.Properties.PubliclyAccessible).toBe(true);
            expect(t.resources.Resources.FriggDBSubnetGroup.Properties.SubnetIds).toEqual([
                { Ref: 'FriggPublicSubnet' },
                { Ref: 'FriggPublicSubnet2' },
            ]);
        });

        test('NO NAT Gateway resource is emitted', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public' }));
            const nats = findResources(t, (r) => r.Type === 'AWS::EC2::NatGateway');
            expect(nats).toHaveLength(0);
        });

        test('Lambda is NOT attached to the VPC (provider.vpc unset)', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public' }));
            expect(t.provider.vpc).toBeUndefined();
        });

        test('DATABASE_URL enforces TLS (sslmode=require)', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public' }));
            const url = t.provider.environment.DATABASE_URL;
            expect(url['Fn::Sub'][0]).toContain('sslmode=require');
        });

        test('combines with scale-to-zero: $0-idle NAT-free Aurora', async () => {
            const t = await composeServerlessDefinition(makeApp({ connectivity: 'public', minCapacity: 0 }));
            const scaling = t.resources.Resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBe(0);
            expect(scaling.SecondsUntilAutoPause).toBe(300);
            expect(findResources(t, (r) => r.Type === 'AWS::EC2::NatGateway')).toHaveLength(0);
            expect(t.provider.vpc).toBeUndefined();
        });
    });

    // ---------------------------------------------------------------------
    // No-regression: default (vpc) connectivity, no new fields
    // ---------------------------------------------------------------------
    describe("default connectivity: 'vpc' (no regression)", () => {
        test('MinCapacity defaults to 0.5 with no SecondsUntilAutoPause', async () => {
            const t = await composeServerlessDefinition(makeApp());
            const scaling = t.resources.Resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBe(0.5);
            expect(scaling.MaxCapacity).toBe(4);
            expect(scaling.SecondsUntilAutoPause).toBeUndefined();
        });

        test('Aurora ingress uses SourceSecurityGroupId (Lambda SG), not CidrIp', async () => {
            const t = await composeServerlessDefinition(makeApp());
            const ingress = findResources(
                t,
                (r) => r.Type === 'AWS::EC2::SecurityGroupIngress' && r.Properties.FromPort === 5432
            );
            expect(ingress).toHaveLength(1);
            expect(ingress[0][1].Properties.SourceSecurityGroupId).toEqual({ Ref: 'FriggLambdaSecurityGroup' });
            expect(ingress[0][1].Properties.CidrIp).toBeUndefined();
            // Logical ID unchanged for the vpc path
            expect(ingress[0][0]).toBe('FriggAuroraIngressRule');
        });

        test('Aurora instance is not publicly accessible by default', async () => {
            const t = await composeServerlessDefinition(makeApp());
            expect(t.resources.Resources.FriggAuroraInstance.Properties.PubliclyAccessible).toBe(false);
        });

        test('Lambda IS attached to the VPC (provider.vpc set)', async () => {
            const t = await composeServerlessDefinition(makeApp());
            expect(t.provider.vpc).toBeDefined();
            expect(t.provider.vpc.subnetIds).toBeDefined();
            expect(t.provider.vpc.securityGroupIds).toBeDefined();
        });

        test('DATABASE_URL does not add sslmode in vpc mode', async () => {
            const t = await composeServerlessDefinition(makeApp());
            const url = t.provider.environment.DATABASE_URL;
            expect(url['Fn::Sub'][0]).not.toContain('sslmode=require');
        });
    });
});
