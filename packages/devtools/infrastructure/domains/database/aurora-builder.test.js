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

        it('should pass validation for managed mode', () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
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
            expect(result.errors.some(e => e.includes('Invalid database.postgres.management'))).toBe(true);
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
            expect(result.errors.some(e => e.includes('minCapacity must be 0 (scale-to-zero) or between 0.5 and 128'))).toBe(true);
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
            expect(result.errors.some(e => e.includes('maxCapacity must be between 0.5 and 128'))).toBe(true);
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

            expect(result.warnings.some(w => w.includes('publiclyAccessible=true is not recommended for production'))).toBe(true);
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

            // buildDatabaseUrl returns CloudFormation Fn::Sub object, not plain string
            expect(result.environment.DATABASE_URL).toBeDefined();
            expect(result.environment.DATABASE_URL['Fn::Sub']).toBeDefined();
            expect(result.environment.DATABASE_URL['Fn::Sub'][1].Host).toBe('cluster.abc.us-east-1.rds.amazonaws.com');
            expect(result.environment.DATABASE_URL['Fn::Sub'][1].Port).toBe(5432);
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

                // Username and Password should use nested Fn::Sub to resolve the Ref
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Username['Fn::Sub']).toBeDefined();
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Password['Fn::Sub']).toBeDefined();

                // Should contain secretsmanager resolution
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Username['Fn::Sub'][0]).toContain('resolve:secretsmanager');
                expect(result.environment.DATABASE_URL['Fn::Sub'][1].Password['Fn::Sub'][0]).toContain('resolve:secretsmanager');

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

                // Should set individual environment variables for flexible credential management
                expect(result.environment.DATABASE_HOST).toBe('cluster.abc.us-east-1.rds.amazonaws.com');
                expect(result.environment.DATABASE_PORT).toBe('5432');
                expect(result.environment.DATABASE_NAME).toBe('frigg');

                // DATABASE_URL should NOT be set (to avoid Serverless variable resolution errors)
                // The application should construct it at runtime from DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD
                expect(result.environment.DATABASE_URL).toBeUndefined();

                // DATABASE_USER and DATABASE_PASSWORD should come from appDefinition.environment
                // and will be set by the environment-builder, not here
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

            it('should generate valid CloudFormation ZipFile code without template literal conflicts', async () => {
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
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                const zipFileCode = result.resources.PasswordRotatorLambda.Properties.Code.ZipFile;

                // Should not contain template literals that would conflict with CloudFormation ${} substitution
                // CloudFormation uses ${} for parameter substitution, so we should avoid `${variable}` in ZipFile
                expect(zipFileCode).not.toMatch(/`.*\$\{(?!env:).*\}`/); // No template literals with ${} except ${env:...}

                // Should use string concatenation instead
                expect(zipFileCode).toContain("'Successfully rotated password for cluster: ' + ClusterIdentifier");
            });

            it('should properly handle Ref objects in buildDatabaseUrl when autoCreateCredentials is enabled', async () => {
                const appDefinition = {
                    database: {
                        postgres: {
                            enable: true,
                            management: 'discover',
                            autoCreateCredentials: true,
                            database: 'testdb',
                        },
                    },
                };

                const discoveredResources = {
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                const dbUrl = result.environment.DATABASE_URL;

                // Should use Fn::Sub with nested Fn::Sub to resolve the Ref
                expect(dbUrl['Fn::Sub']).toBeDefined();
                // Template includes pool + timeout query params to prevent
                // silent 15-min Lambda hangs on DB contention.
                expect(dbUrl['Fn::Sub'][0]).toMatch(
                    /^postgresql:\/\/\$\{Username\}:\$\{Password\}@\$\{Host\}:\$\{Port\}\/\$\{Database\}\?/
                );
                expect(dbUrl['Fn::Sub'][0]).toContain('connection_limit=2');
                expect(dbUrl['Fn::Sub'][0]).toContain('pool_timeout=20');
                expect(dbUrl['Fn::Sub'][0]).toContain('connect_timeout=10');
                expect(dbUrl['Fn::Sub'][0]).toContain('socket_timeout=60');
                expect(dbUrl['Fn::Sub'][0]).toContain('statement_timeout%3D30000');
                expect(dbUrl['Fn::Sub'][0]).toContain('lock_timeout%3D10000');

                // The Username and Password should use Fn::Sub to resolve the secret Ref, not literal "[object Object]"
                expect(dbUrl['Fn::Sub'][1].Username['Fn::Sub']).toBeDefined();
                expect(dbUrl['Fn::Sub'][1].Password['Fn::Sub']).toBeDefined();

                // Should not contain the literal string "[object Object]"
                const jsonOutput = JSON.stringify(dbUrl);
                expect(jsonOutput).not.toContain('[object Object]');
            });

            it('should exclude URL-special characters from password generation for Prisma compatibility', async () => {
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
                    auroraClusterEndpoint: 'cluster.abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                };

                const result = await auroraBuilder.build(appDefinition, discoveredResources);

                const excludeChars = result.resources.FriggDBSecret.Properties.GenerateSecretString.ExcludeCharacters;

                // Must exclude URL-special characters that would break Prisma connection strings
                // Prisma docs: https://www.prisma.io/docs/reference/database-reference/connection-urls#special-characters
                // These characters have special meaning in URLs and must be excluded or the password must be URL-encoded
                // Exclude: " @ : / ? # [ ] % (and \ for JSON escaping)
                expect(excludeChars).toBe('"@:/?#[]%\\\\');

                // Verify it can be JSON-stringified without errors
                expect(() => JSON.stringify(result.resources.FriggDBSecret)).not.toThrow();
            });
        });
    });

    describe('build() - managed mode', () => {
        it('should create Aurora cluster resources', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
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

            // PubliclyAccessible is NOT supported on Aurora clusters (only on instances)
            expect(result.resources.FriggAuroraCluster.Properties.PubliclyAccessible).toBeUndefined();

            // Port should be explicitly set to PostgreSQL standard (5432)
            expect(result.resources.FriggAuroraCluster.Properties.Port).toBe(5432);

            // Should create self-referencing security group ingress rule
            expect(result.resources.FriggAuroraIngressRule).toBeDefined();
            expect(result.resources.FriggAuroraIngressRule.Type).toBe('AWS::EC2::SecurityGroupIngress');
            expect(result.resources.FriggAuroraIngressRule.Properties.FromPort).toBe(5432);
            expect(result.resources.FriggAuroraIngressRule.Properties.ToPort).toBe(5432);
        });

        it('should create database subnet group', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
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
                        management: 'managed',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggDBSecret).toBeDefined();
            expect(result.resources.FriggDBSecret.Type).toBe('AWS::SecretsManager::Secret');
        });

        it('should configure Aurora Serverless v2', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggAuroraCluster.Properties.EngineMode).toBe('provisioned');
            expect(result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration).toBeDefined();
        });

        it('should use custom capacity settings', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
                        minCapacity: 1,
                        maxCapacity: 8,
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            const scaling = result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBe(1);
            expect(scaling.MaxCapacity).toBe(8);
        });

        it('should default to sensible capacity values', async () => {
            const appDefinition = {
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-123',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            const scaling = result.resources.FriggAuroraCluster.Properties.ServerlessV2ScalingConfiguration;
            expect(scaling.MinCapacity).toBeGreaterThanOrEqual(0.5);
            expect(scaling.MaxCapacity).toBeLessThanOrEqual(128);
        });
    });

    describe('Top-Level Management Mode', () => {
        it('should reuse stack Aurora when managementMode=managed + vpcIsolation=isolated AND stack has Aurora', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',  // Should be IGNORED
                        minCapacity: 0.5,
                        maxCapacity: 1,
                    },
                },
            };

            // CloudFormation stack has Aurora (from previous deployment of this stage)
            const discoveredResources = {
                auroraClusterId: 'stack-cluster-dev',  // CloudFormation discovery sets this
                auroraClusterEndpoint: 'stack-cluster-dev.us-east-1.rds.amazonaws.com',  // For discover mode
                auroraClusterPort: 5432,
                auroraClusterIdentifier: 'stack-cluster-dev',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("managementMode='managed' ignoring")
            );

            // Should log reusing stack Aurora
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("stack has Aurora, reusing")
            );

            // Should keep Aurora definitions in template (CloudFormation idempotency)
            // Even though Aurora exists in stack, we include definitions - CF won't recreate
            expect(result.resources.FriggAuroraCluster).toBeDefined();
            expect(result.resources.FriggAuroraCluster.Type).toBe('AWS::RDS::DBCluster');
            expect(result.resources.FriggAuroraInstance).toBeDefined();
            expect(result.resources.FriggAuroraInstance.Type).toBe('AWS::RDS::DBInstance');
            expect(result.environment.DATABASE_URL).toBeDefined();

            consoleLogSpy.mockRestore();
        });

        it('should create new Aurora when managementMode=managed + vpcIsolation=isolated AND stack has NO Aurora', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'isolated',
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',  // Should be IGNORED
                        minCapacity: 0.5,
                        maxCapacity: 1,
                    },
                },
            };

            // No Aurora in CloudFormation stack (fresh deployment)
            const discoveredResources = {
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
                // No auroraEndpoint
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("managementMode='managed' ignoring")
            );

            // Should log creating new Aurora
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("no stack Aurora, creating new")
            );

            // Should create new Aurora cluster (isolated mode)
            expect(result.resources.FriggAuroraCluster).toBeDefined();
            expect(result.environment.DATABASE_URL).toBeDefined();

            consoleLogSpy.mockRestore();
        });

        it('should use managementMode=managed with vpcIsolation=shared to discover Aurora', async () => {
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'shared',
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',  // Should be IGNORED
                    },
                },
            };

            const discoveredResources = {
                auroraClusterEndpoint: 'existing-cluster.us-east-1.rds.amazonaws.com',
                auroraClusterPort: 5432,
                auroraClusterIdentifier: 'existing-cluster',
                databaseSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:shared-db-secret',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            // Should warn about ignored options
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("ignoring")
            );

            // Should discover existing Aurora
            expect(result.resources.FriggAuroraCluster).toBeUndefined();
            expect(result.environment.DATABASE_URL).toBeDefined();

            consoleLogSpy.mockRestore();
        });

        it('should respect granular management when no managementMode specified', async () => {
            const appDefinition = {
                // No managementMode
                database: {
                    postgres: {
                        enable: true,
                        management: 'managed',  // Should be RESPECTED
                    },
                },
            };

            const discoveredResources = {
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const result = await auroraBuilder.build(appDefinition, discoveredResources);

            // Should create Aurora cluster
            expect(result.resources.FriggAuroraCluster).toBeDefined();
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

            // use-existing mode sets individual components, not DATABASE_URL
            expect(result.environment.DATABASE_HOST).toBe('custom-db.example.com');
            expect(result.environment.DATABASE_PORT).toBe('5432');
            expect(result.environment.DATABASE_NAME).toBe('frigg');
            expect(result.environment.DATABASE_USER).toBe('postgres');
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
            expect(result.resources.FriggDBSecret).toBeUndefined();
        });
    });

    describe('getName()', () => {
        it('should return AuroraBuilder', () => {
            expect(auroraBuilder.getName()).toBe('AuroraBuilder');
        });
    });
});

