/**
 * Tests for Aurora Builder
 * 
 * Tests Aurora PostgreSQL cluster configuration
 */

const { AuroraBuilder } = require('./aurora-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('AuroraBuilder', () => {
    let auroraBuilder;

    beforeEach(() => {
        auroraBuilder = new AuroraBuilder();
        // Clean up env vars
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        // Clean up env vars
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('shouldExecute()', () => {
        it('should return true when Postgres is enabled', () => {
            const appDefinition = {
                database: {
                    postgres: { enable: true },
                },
            };

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when Postgres is disabled', () => {
            const appDefinition = {
                database: {
                    postgres: { enable: false },
                },
            };

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when database is not defined', () => {
            const appDefinition = {};

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when postgres is not defined', () => {
            const appDefinition = {
                database: {},
            };

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is set (local mode)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                database: {
                    postgres: { enable: true },
                },
            };

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return true when FRIGG_SKIP_AWS_DISCOVERY is not set and Postgres is enabled', () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;

            const appDefinition = {
                database: {
                    postgres: { enable: true },
                },
            };

            expect(auroraBuilder.shouldExecute(appDefinition)).toBe(true);
        });
    });

    describe('getDependencies()', () => {
        it('should depend on VpcBuilder', () => {
            const deps = auroraBuilder.getDependencies();

            expect(deps).toEqual(['VpcBuilder']);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid discover mode config', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass validation for create-new mode', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error when database config is missing', () => {
            const appDefinition = {};

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('PostgreSQL database configuration is missing');
        });

        it('should error for invalid management mode', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'invalid-mode',
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                expect.stringContaining('Invalid database.postgres.management')
            );
        });

        it('should error when use-existing without endpoint', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'database.postgres.endpoint is required when management="use-existing"'
            );
        });

        it('should pass when use-existing with endpoint', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                        endpoint: 'db.example.com',
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error when minCapacity is out of range', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        minCapacity: 0.25, // Too low
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                expect.stringContaining('minCapacity must be between 0.5 and 128')
            );
        });

        it('should error when maxCapacity is out of range', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        maxCapacity: 256, // Too high
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                expect.stringContaining('maxCapacity must be between 0.5 and 128')
            );
        });

        it('should pass with valid capacity values', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        minCapacity: 0.5,
                        maxCapacity: 16,
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should warn about public accessibility', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        publiclyAccessible: true,
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.warnings).toContain(
                expect.stringContaining('publiclyAccessible=true is not recommended for production')
            );
        });

        it('should not warn when publiclyAccessible is false', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        publiclyAccessible: false,
                    },
                },
            };

            const result = auroraBuilder.validate(appDefinition);

            expect(result.warnings).toEqual([]);
        });
    });

    describe('build() - discover mode', () => {
        it('should use discovered database endpoint', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const discoveredResources = {
                auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                auroraPort: 5432,
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.environment.DATABASE_URL).toContain('cluster.abc.us-east-1.rds.amazonaws.com');
            expect(result.environment.DATABASE_URL).toContain('5432');
        });

        it('should add IAM permissions for Secrets Manager', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const discoveredResources = {
                auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                auroraPort: 5432,
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            const secretPermission = result.iamStatements.find(stmt =>
                stmt.Action.includes('secretsmanager:GetSecretValue')
            );

            expect(secretPermission).toBeDefined();
            expect(secretPermission.Resource).toBe('arn:aws:secretsmanager:us-east-1:123:secret:db');
        });

        it('should add security group ingress rule for Lambda to Aurora connectivity', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const discoveredResources = {
                auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                auroraPort: 5432,
                auroraSecurityGroupId: 'sg-aurora123',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggAuroraIngressRule).toBeDefined();
            expect(result.resources.FriggAuroraIngressRule.Type).toBe('AWS::EC2::SecurityGroupIngress');
            expect(result.resources.FriggAuroraIngressRule.Properties.GroupId).toBe('sg-aurora123');
            expect(result.resources.FriggAuroraIngressRule.Properties.IpProtocol).toBe('tcp');
            expect(result.resources.FriggAuroraIngressRule.Properties.FromPort).toBe(5432);
            expect(result.resources.FriggAuroraIngressRule.Properties.ToPort).toBe(5432);
            expect(result.resources.FriggAuroraIngressRule.Properties.SourceSecurityGroupId).toEqual({ Ref: 'FriggLambdaSecurityGroup' });
        });

        describe('autoCreateCredentials', () => {
            it('should create Secrets Manager secret and password rotator when autoCreateCredentials is enabled', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: true,
                            username: 'postgres',
                            database: 'frigg',
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'quo-aurora-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                // Check secret creation
                expect(result.resources.FriggDBSecret).toBeDefined();
                expect(result.resources.FriggDBSecret.Type).toBe('AWS::SecretsManager::Secret');
                expect(result.resources.FriggDBSecret.Properties.GenerateSecretString.SecretStringTemplate).toContain('postgres');
                expect(result.resources.FriggDBSecret.Properties.GenerateSecretString.PasswordLength).toBe(32);

                // Check password rotator Lambda
                expect(result.resources.PasswordRotatorLambda).toBeDefined();
                expect(result.resources.PasswordRotatorLambda.Type).toBe('AWS::Lambda::Function');
                expect(result.resources.PasswordRotatorLambda.Properties.Runtime).toBe('nodejs22.x');

                // Check custom resource
                expect(result.resources.FriggAuroraPasswordRotator).toBeDefined();
                expect(result.resources.FriggAuroraPasswordRotator.Type).toBe('Custom::AuroraPasswordRotator');
                expect(result.resources.FriggAuroraPasswordRotator.Properties.ClusterIdentifier).toBe('quo-aurora-cluster');

                // Check IAM role
                expect(result.resources.PasswordRotatorRole).toBeDefined();
                expect(result.resources.PasswordRotatorRole.Type).toBe('AWS::IAM::Role');

                // Check DATABASE_URL uses the secret
                expect(result.environment.DATABASE_URL).toBeDefined();
                expect(result.environment.DATABASE_URL['Fn::Sub']).toBeDefined();
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Username).toContain('resolve:secretsmanager');
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Password).toContain('resolve:secretsmanager');

                // Check IAM permissions for secret access
                const secretPermission = result.iamStatements.find(stmt =>
                    stmt.Action.includes('secretsmanager:GetSecretValue')
                );
                expect(secretPermission).toBeDefined();
            });

            it('should not create credentials when autoCreateCredentials is false', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: false,
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                // Should not create secret or rotator
                expect(result.resources.FriggDBSecret).toBeUndefined();
                expect(result.resources.PasswordRotatorLambda).toBeUndefined();
                expect(result.resources.FriggAuroraPasswordRotator).toBeUndefined();
                expect(result.resources.PasswordRotatorRole).toBeUndefined();

                // DATABASE_URL should use env variables
                expect(result.environment.DATABASE_URL).toBeDefined();
                expect(result.environment.DATABASE_URL['Fn::Sub']).toBeDefined();
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].DatabaseUser).toContain('env:DATABASE_USER');
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].DatabasePassword).toContain('env:DATABASE_PASSWORD');
            });

            it('should not create credentials when secret is already discovered', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: true, // Enabled, but secret already exists
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                    databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123:secret:existing-secret',
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                // Should use existing secret, not create new one
                expect(result.resources.FriggDBSecret).toBeUndefined();
                expect(result.resources.PasswordRotatorLambda).toBeUndefined();
                expect(result.environment.DATABASE_SECRET_ARN).toBe('arn:aws:secretsmanager:us-east-1:123:secret:existing-secret');
            });

            it('should extract correct cluster identifier from endpoint', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: true,
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'my-cluster-name.cluster-xyz123.us-west-2.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                expect(result.resources.FriggAuroraPasswordRotator.Properties.ClusterIdentifier).toBe('my-cluster-name');
            });

            it('should set DATABASE_HOST, DATABASE_PORT, DATABASE_NAME when autoCreateCredentials is enabled', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: true,
                            database: 'mydb',
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                expect(result.environment.DATABASE_HOST).toBe('cluster.abc.us-east-1.rds.amazonaws.com');
                expect(result.environment.DATABASE_PORT).toBe('5432');
            });
        });
    });

    describe('build() - create-new mode', () => {
        it('should create Aurora cluster resources', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggAuroraCluster).toBeDefined();
            expect(result.resources.FriggAuroraCluster.Type).toBe('AWS::RDS::DBCluster');
        });

        it('should create database subnet group', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggDBSubnetGroup).toBeDefined();
            expect(result.resources.FriggDBSubnetGroup.Type).toBe('AWS::RDS::DBSubnetGroup');
        });

        it('should create Secrets Manager secret for credentials', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggDatabaseSecret).toBeDefined();
            expect(result.resources.FriggDatabaseSecret.Type).toBe('AWS::SecretsManager::Secret');
        });

        it('should configure Aurora Serverless v2', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const result = await auroraBuilder.build(appDefinition, {});

            expect(result.resources.FriggAuroraCluster.Properties.EngineMode).toBe('provisioned');
            expect(result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration).toBeDefined();
        });

        it('should use custom capacity settings', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        minCapacity: 1,
                        maxCapacity: 8,
                    },
                },
            };

            const result = await auroraBuilder.build(appDefinition, {});

            const scaling = result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBe(1);
            expect(scaling.MaxCapacity).toBe(8);
        });

        it('should default to sensible capacity values', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const result = await auroraBuilder.build(appDefinition, {});

            const scaling = result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBeGreaterThanOrEqual(0.5);
            expect(scaling.MaxCapacity).toBeLessThanOrEqual(128);
        });
    });

    describe('build() - use-existing mode', () => {
        it('should use provided database endpoint', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                        endpoint: 'custom-db.example.com',
                        port: 5432,
                    },
                },
            };

            const result = await auroraBuilder.build(appDefinition, {});

            expect(result.environment.DATABASE_URL).toContain('custom-db.example.com');
            expect(result.environment.DATABASE_URL).toContain('5432');
        });

        it('should not create Aurora resources in use-existing mode', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                        endpoint: 'db.example.com',
                    },
                },
            };

            const result = await auroraBuilder.build(appDefinition, {});

            expect(result.resources.FriggAuroraCluster).toBeUndefined();
            expect(result.resources.FriggDatabaseSecret).toBeUndefined();
        });
    });

    describe('getName()', () => {
        it('should return AuroraBuilder', () => {
            expect(auroraBuilder.getName()).toBe('AuroraBuilder');
        });
    });
});

