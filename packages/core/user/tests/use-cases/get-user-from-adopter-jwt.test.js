const Boom = require('@hapi/boom');
const { GetUserFromAdopterJwt } = require('../../use-cases/get-user-from-adopter-jwt');

describe('GetUserFromAdopterJwt', () => {
    let getUserFromAdopterJwt;
    let mockUserRepository;
    let mockUserConfig;

    beforeEach(() => {
        mockUserRepository = {
            findIndividualUserByAppUserId: jest.fn(),
            findOrganizationUserByAppOrgId: jest.fn(),
            createIndividualUser: jest.fn(),
            createOrganizationUser: jest.fn(),
        };

        mockUserConfig = {
            usePassword: false,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
            authModes: {
                adopterJwt: true,
            },
            jwtConfig: {
                secret: 'test-secret',
                userIdClaim: 'sub',
                orgIdClaim: 'org_id',
                algorithm: 'HS256',
            },
        };

        getUserFromAdopterJwt = new GetUserFromAdopterJwt({
            userRepository: mockUserRepository,
            userConfig: mockUserConfig,
        });
    });

    describe('Stub Behavior', () => {
        it('should throw 501 Not Implemented error', async () => {
            const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwib3JnX2lkIjoib3JnNDU2In0.signature';

            await expect(
                getUserFromAdopterJwt.execute(jwtToken)
            ).rejects.toThrow(Boom.notImplemented().message);
        });

        it('should provide helpful error message about alternative auth modes', async () => {
            const jwtToken = 'test.jwt.token';

            try {
                await getUserFromAdopterJwt.execute(jwtToken);
                fail('Should have thrown error');
            } catch (error) {
                expect(error.message).toContain('not yet implemented');
                expect(error.message).toContain('friggToken');
                expect(error.message).toContain('xFriggHeaders');
            }
        });

        it('should throw 501 error with any token format', async () => {
            await expect(
                getUserFromAdopterJwt.execute('simple-token')
            ).rejects.toThrow(Boom.notImplemented().message);

            await expect(
                getUserFromAdopterJwt.execute('part1.part2.part3')
            ).rejects.toThrow(Boom.notImplemented().message);

            await expect(getUserFromAdopterJwt.execute('')).rejects.toThrow(
                Boom.notImplemented().message
            );
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully with valid configuration', () => {
            expect(getUserFromAdopterJwt).toBeDefined();
            expect(getUserFromAdopterJwt.userRepository).toBe(
                mockUserRepository
            );
            expect(getUserFromAdopterJwt.userConfig).toBe(mockUserConfig);
        });

        it('should initialize without jwtConfig (will fail on execute)', () => {
            const configWithoutJwt = {
                usePassword: false,
                primary: 'individual',
            };

            const instance = new GetUserFromAdopterJwt({
                userRepository: mockUserRepository,
                userConfig: configWithoutJwt,
            });

            expect(instance).toBeDefined();
        });
    });

    describe('Future Implementation Notes', () => {
        it('should have documented todos for JWT implementation', () => {
            const useCaseFileContent = require('fs').readFileSync(
                require.resolve('../../use-cases/get-user-from-adopter-jwt.js'),
                'utf-8'
            );

            expect(useCaseFileContent).toContain('@todo');
            expect(useCaseFileContent).toContain('jsonwebtoken');
            expect(useCaseFileContent).toContain('FUTURE IMPLEMENTATION');
        });
    });
});

