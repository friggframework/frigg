const { GetUserFromXFriggHeaders } = require('../../use-cases/get-user-from-x-frigg-headers');
const { User } = require('../../user');
const {
    EnsureOrganizationMembership,
} = require('../../use-cases/ensure-organization-membership');
const { createMemorySink } = require('../../../logs');

describe('GetUserFromXFriggHeaders', () => {
    let getUserFromXFriggHeaders;
    let mockUserRepository;
    let mockMembershipRepository;
    let mockUserConfig;

    // The real use case over the mocked repositories: strict mode is a
    // property of both, so the tests exercise them together.
    const build = () =>
        new GetUserFromXFriggHeaders({
            userRepository: mockUserRepository,
            ensureOrganizationMembership: new EnsureOrganizationMembership({
                userRepository: mockUserRepository,
                organizationMembershipRepository: mockMembershipRepository,
            }),
            userConfig: mockUserConfig,
        });

    const rejection = async (promise) => {
        try {
            await promise;
        } catch (error) {
            return error;
        }
        throw new Error('expected a rejection');
    };

    beforeEach(() => {
        mockUserRepository = {
            findIndividualUserByAppUserId: jest.fn(),
            findOrganizationUserByAppOrgId: jest.fn(),
            createIndividualUser: jest.fn(),
            createOrganizationUser: jest.fn(),
            linkIndividualToOrganizationIfUnset: jest.fn(async (id, orgId) => ({
                id,
                organizationId: orgId,
            })),
        };

        // Nobody is a member of anything unless a test says so.
        mockMembershipRepository = {
            findMembership: jest.fn().mockResolvedValue(null),
            addMembership: jest.fn(async (individualUserId, organizationUserId) => ({
                individualUserId,
                organizationUserId,
                role: null,
                implicit: false,
            })),
        };

        mockUserConfig = {
            usePassword: false,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
        };

        getUserFromXFriggHeaders = build();
    });

    describe('Validation', () => {
        it('should throw 400 error when neither appUserId nor appOrgId provided', async () => {
            const error = await rejection(
                getUserFromXFriggHeaders.execute(null, null)
            );
            expect(error.isBoom).toBe(true);
            expect(error.output.statusCode).toBe(400);
            expect(error.message).toMatch(/x-frigg-appUserId or x-frigg-appOrgId/);

            await expect(
                getUserFromXFriggHeaders.execute(undefined, undefined)
            ).rejects.toThrow();
        });
    });

    describe('Find Existing User', () => {
        it('should find existing individual user by appUserId', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
                username: 'testuser',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.findIndividualUserByAppUserId
            ).toHaveBeenCalledWith('app-user-456');
            expect(
                mockUserRepository.createIndividualUser
            ).not.toHaveBeenCalled();
        });

        it('should find existing organization user by appOrgId', async () => {
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.primary = 'organization';

            const mockOrgUser = {
                id: 'org-123',
                appOrgId: 'app-org-456',
            };

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'app-org-456'
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.findOrganizationUserByAppOrgId
            ).toHaveBeenCalledWith('app-org-456');
            expect(
                mockUserRepository.createOrganizationUser
            ).not.toHaveBeenCalled();
        });
    });

    describe('Auto-create User', () => {
        it('should create new individual user when appUserId not found', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );

            const mockCreatedUser = {
                id: 'user-new',
                appUserId: 'new-app-user',
                username: 'app-user-new-app-user',
                email: 'new-app-user@app.local',
            };

            mockUserRepository.createIndividualUser.mockResolvedValue(
                mockCreatedUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                'new-app-user',
                null
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.createIndividualUser
            ).toHaveBeenCalledWith({
                appUserId: 'new-app-user',
                username: 'app-user-new-app-user',
                email: 'new-app-user@app.local',
            });
        });

        it('should create new organization user when appOrgId not found', async () => {
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.primary = 'organization';
            mockUserConfig.individualUserRequired = false;

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockCreatedOrgUser = {
                id: 'org-new',
                appOrgId: 'new-app-org',
            };

            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'new-app-org'
            );

            expect(result).toBeInstanceOf(User);
            expect(
                mockUserRepository.createOrganizationUser
            ).toHaveBeenCalledWith({
                appOrgId: 'new-app-org',
            });
        });

        it('should auto-create organization user when individual exists but org user missing', async () => {
            // This is the critical scenario: primary is 'organization', both users are required,
            // individual user exists, but org user needs to be created
            mockUserConfig.primary = 'organization';
            mockUserConfig.organizationUserRequired = true;
            mockUserConfig.individualUserRequired = true;

            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockCreatedOrgUser = {
                id: 'org-new',
                appOrgId: 'app-org-789',
            };

            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );
            mockUserRepository.linkIndividualToOrganizationIfUnset = jest.fn().mockResolvedValue({
                ...mockIndividualUser,
                organizationUser: 'org-new',
            });

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            expect(mockUserRepository.createOrganizationUser).toHaveBeenCalledWith({
                appOrgId: 'app-org-789',
            });
            // Should link the individual user to the newly created org user
            expect(mockUserRepository.linkIndividualToOrganizationIfUnset).toHaveBeenCalledWith(
                'user-123',
                'org-new'
            );
            expect(result.getId()).toBeDefined();
            expect(result.getId()).not.toBeUndefined();
            // When primary is 'organization', getId() should return the org user's ID
            expect(result.getId()).toBe('org-new');
        });
    });

    describe('Organization membership (ADR-056 §3.6)', () => {
        const individual = (extra = {}) => ({
            id: 'user-123',
            appUserId: 'app-user-456',
            ...extra,
        });
        const organization = { id: 'org-888', appOrgId: 'app-org-789' };

        beforeEach(() => {
            mockUserConfig.organizationUserRequired = true;
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                organization
            );
        });

        it('adds a membership instead of re-linking a person who belongs to another organization', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual({ organizationId: 'org-999' })
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(mockMembershipRepository.addMembership).toHaveBeenCalledWith(
                'user-123',
                'org-888',
                { orgRole: null }
            );
            expect(
                mockUserRepository.linkIndividualToOrganizationIfUnset
            ).not.toHaveBeenCalled();
            expect(result.getActiveOrganizationId()).toBe('org-888');
            // The legacy pointer is untouched on the record that was read.
            expect(result.getIndividualUser().organizationId).toBe('org-999');
        });

        it('alternating requests for two organizations never move the person', async () => {
            const person = individual({ organizationId: 'org-999' });
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                person
            );
            const members = new Set();
            mockMembershipRepository.findMembership.mockImplementation(
                async (i, o) => (members.has(`${i}|${o}`) ? { implicit: false } : null)
            );
            mockMembershipRepository.addMembership.mockImplementation(
                async (i, o) => {
                    members.add(`${i}|${o}`);
                    return { implicit: false };
                }
            );
            const orgs = {
                'app-org-1': { id: 'org-1', appOrgId: 'app-org-1' },
                'app-org-2': { id: 'org-2', appOrgId: 'app-org-2' },
            };
            mockUserRepository.findOrganizationUserByAppOrgId.mockImplementation(
                async (id) => orgs[id]
            );

            for (const id of ['app-org-1', 'app-org-2', 'app-org-1']) {
                const result = await getUserFromXFriggHeaders.execute(
                    'app-user-456',
                    id
                );
                expect(result.getActiveOrganizationId()).toBe(orgs[id].id);
            }

            expect(
                mockUserRepository.linkIndividualToOrganizationIfUnset
            ).not.toHaveBeenCalled();
            expect(mockMembershipRepository.addMembership).toHaveBeenCalledTimes(2);
        });

        it('sets the legacy pointer on a first link only', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual()
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(
                mockUserRepository.linkIndividualToOrganizationIfUnset
            ).toHaveBeenCalledWith('user-123', 'org-888');
            expect(mockMembershipRepository.addMembership).toHaveBeenCalled();
            expect(result.getIndividualUser().organizationId).toBe('org-888');
        });

        it('writes nothing when the person is already a member', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual({ organizationId: 'org-999' })
            );
            mockMembershipRepository.findMembership.mockResolvedValue({
                individualUserId: 'user-123',
                organizationUserId: 'org-888',
                implicit: false,
            });

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(mockMembershipRepository.findMembership).toHaveBeenCalledWith(
                'user-123',
                'org-888'
            );
            expect(mockMembershipRepository.addMembership).not.toHaveBeenCalled();
            expect(
                mockUserRepository.linkIndividualToOrganizationIfUnset
            ).not.toHaveBeenCalled();
            expect(
                mockUserRepository.createIndividualUser
            ).not.toHaveBeenCalled();
            expect(
                mockUserRepository.createOrganizationUser
            ).not.toHaveBeenCalled();
            expect(result).toBeInstanceOf(User);
        });

        it.each(['strictMembership', 'strictUserValidation'])(
            'rejects an unknown pairing with 400 when %s is on, and writes nothing',
            async (flag) => {
                mockUserConfig[flag] = true;
                getUserFromXFriggHeaders = build();
                mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                    individual({ organizationId: 'org-999' })
                );

                const error = await rejection(
                    getUserFromXFriggHeaders.execute(
                        'app-user-456',
                        'app-org-789'
                    )
                );

                expect(error.isBoom).toBe(true);
                expect(error.output.statusCode).toBe(400);
                expect(error.message).toContain('not a member');
                expect(mockMembershipRepository.addMembership).not.toHaveBeenCalled();
                expect(
                    mockUserRepository.linkIndividualToOrganizationIfUnset
                ).not.toHaveBeenCalled();
            }
        );

        it('strict mode still admits a person whose legacy pointer names the organization', async () => {
            mockUserConfig.strictMembership = true;
            getUserFromXFriggHeaders = build();
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual({ organizationId: 'org-888' })
            );
            mockMembershipRepository.findMembership.mockResolvedValue({
                implicit: true,
            });

            await expect(
                getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789')
            ).resolves.toBeInstanceOf(User);
        });

        it('strict mode does not judge an organization this request just created', async () => {
            mockUserConfig.strictMembership = true;
            getUserFromXFriggHeaders = build();
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual()
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );
            mockUserRepository.createOrganizationUser.mockResolvedValue(
                organization
            );

            await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(mockMembershipRepository.addMembership).toHaveBeenCalledWith(
                'user-123',
                'org-888',
                { orgRole: null }
            );
        });

        it('strictMembership takes precedence over the strictUserValidation alias', async () => {
            mockUserConfig.strictMembership = false;
            mockUserConfig.strictUserValidation = true;
            getUserFromXFriggHeaders = build();
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual({ organizationId: 'org-999' })
            );

            await expect(
                getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789')
            ).resolves.toBeInstanceOf(User);
        });

        it('does not touch memberships when only one id is provided', async () => {
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual()
            );

            await getUserFromXFriggHeaders.execute('app-user-456', null);

            expect(mockMembershipRepository.findMembership).not.toHaveBeenCalled();
            expect(mockMembershipRepository.addMembership).not.toHaveBeenCalled();
        });

        it('strict: a brand-new person naming an existing organization is refused, and nothing is created or added', async () => {
            mockUserConfig.strictMembership = true;
            getUserFromXFriggHeaders = build();
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );
            mockUserRepository.createIndividualUser.mockResolvedValue(
                individual()
            );

            const error = await rejection(
                getUserFromXFriggHeaders.execute(
                    'app-user-456',
                    'app-org-789'
                )
            );

            expect(error.output.statusCode).toBe(400);
            expect(error.message).toContain('not a member');
            expect(mockMembershipRepository.addMembership).not.toHaveBeenCalled();
            expect(
                mockUserRepository.linkIndividualToOrganizationIfUnset
            ).not.toHaveBeenCalled();
        });

        it('strict: a brand-new person naming a brand-new organization is allowed', async () => {
            mockUserConfig.strictMembership = true;
            getUserFromXFriggHeaders = build();
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );
            mockUserRepository.createIndividualUser.mockResolvedValue(
                individual()
            );
            mockUserRepository.createOrganizationUser.mockResolvedValue(
                organization
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result.getActiveOrganizationId()).toBe('org-888');
            expect(mockMembershipRepository.addMembership).toHaveBeenCalledWith(
                'user-123',
                'org-888',
                { orgRole: null }
            );
        });

        it('strict: only the organization header, no person, is not judged', async () => {
            mockUserConfig.strictMembership = true;
            getUserFromXFriggHeaders = build();

            await expect(
                getUserFromXFriggHeaders.execute(null, 'app-org-789')
            ).resolves.toBeInstanceOf(User);
        });

        describe('deprecated strictUserValidation alias', () => {
            const EVENT =
                'frigg.user.x_frigg_headers.strict_user_validation_deprecated';
            let sink;
            let consoleSpies;
            beforeEach(() => {
                sink = createMemorySink();
                consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map(
                    (m) => jest.spyOn(console, m).mockImplementation(() => {})
                );
            });
            afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));
            const warnings = () =>
                sink.records.filter((r) => r.eventName === EVENT);

            it('warns once, at construction, when it is set without strictMembership', () => {
                mockUserConfig.strictUserValidation = true;

                const useCase = build();
                expect(warnings()).toHaveLength(1);
                expect(warnings()[0].level).toBe('WARN');

                // Not per request.
                mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                    individual({ organizationId: 'org-888' })
                );
                return useCase.execute('app-user-456', null).then(() => {
                    expect(warnings()).toHaveLength(1);
                });
            });

            it('is silent when strictMembership is set, even beside the alias', () => {
                mockUserConfig.strictMembership = false;
                mockUserConfig.strictUserValidation = true;
                build();
                expect(warnings()).toHaveLength(0);
            });

            it('is silent when neither is set', () => {
                build();
                expect(warnings()).toHaveLength(0);
            });
        });

        it('uses the injected use case, passing requireExisting only for an organization that already existed', async () => {
            mockUserConfig.strictMembership = true;
            const ensureOrganizationMembership = {
                execute: jest.fn(async ({ individual: i }) => ({
                    individual: i,
                    membership: { orgRole: 'MEMBER' },
                })),
            };
            const stubbed = new GetUserFromXFriggHeaders({
                userRepository: mockUserRepository,
                ensureOrganizationMembership,
                userConfig: mockUserConfig,
            });
            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                individual()
            );

            await stubbed.execute('app-user-456', 'app-org-789');

            expect(ensureOrganizationMembership.execute).toHaveBeenCalledWith({
                individual: individual(),
                organization,
                requireExisting: true,
            });
        });

        it('recovers from a first-login race on creating the individual', async () => {
            const winner = individual();
            mockUserRepository.findIndividualUserByAppUserId
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(winner);
            mockUserRepository.createIndividualUser.mockRejectedValue(
                Object.assign(new Error('unique'), { code: 'P2002' })
            );

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result.getIndividualUser().id).toBe('user-123');
            expect(
                mockUserRepository.findIndividualUserByAppUserId
            ).toHaveBeenCalledTimes(2);
        });
    });

    describe('User Config Respect', () => {
        it('should respect individualUserRequired setting', async () => {
            mockUserConfig.individualUserRequired = false;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                null
            );

            await getUserFromXFriggHeaders.execute('app-user-test', null);

            // Should not attempt to query or create individual user if not required
            expect(
                mockUserRepository.findIndividualUserByAppUserId
            ).not.toHaveBeenCalled();
        });

        it('should respect organizationUserRequired setting', async () => {
            mockUserConfig.organizationUserRequired = false;

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );

            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );

            await getUserFromXFriggHeaders.execute('app-user-456', 'app-org-789');

            // Should not query org user if not required
            expect(
                mockUserRepository.findOrganizationUserByAppOrgId
            ).not.toHaveBeenCalled();
        });

        it('should respect primary user setting', async () => {
            mockUserConfig.primary = 'organization';
            mockUserConfig.organizationUserRequired = true;

            const mockOrgUser = {
                id: 'org-123',
                appOrgId: 'app-org-789',
            };

            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                mockOrgUser
            );

            const result = await getUserFromXFriggHeaders.execute(
                null,
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            // Verify User is constructed with org as primary
            expect(result.config.primary).toBe('organization');
        });
    });

    describe('Edge Cases', () => {
        it('should handle both IDs when only one user exists', async () => {
            const mockIndividualUser = {
                id: 'user-123',
                appUserId: 'app-user-456',
            };

            const mockCreatedOrgUser = {
                id: 'org-new',
                appOrgId: 'app-org-789',
            };

            mockUserConfig.organizationUserRequired = true;

            mockUserRepository.findIndividualUserByAppUserId.mockResolvedValue(
                mockIndividualUser
            );
            mockUserRepository.findOrganizationUserByAppOrgId.mockResolvedValue(
                null
            );
            mockUserRepository.createOrganizationUser.mockResolvedValue(
                mockCreatedOrgUser
            );
            mockUserRepository.linkIndividualToOrganizationIfUnset = jest.fn().mockResolvedValue({
                ...mockIndividualUser,
                organizationUser: 'org-new',
            });

            const result = await getUserFromXFriggHeaders.execute(
                'app-user-456',
                'app-org-789'
            );

            expect(result).toBeInstanceOf(User);
            // Should not throw conflict error when only one user found
            // Should auto-create org user and link it
            expect(mockUserRepository.createOrganizationUser).toHaveBeenCalled();
            expect(mockUserRepository.linkIndividualToOrganizationIfUnset).toHaveBeenCalledWith(
                'user-123',
                'org-new'
            );
        });

        it('should handle empty string IDs as falsy', async () => {
            await expect(
                getUserFromXFriggHeaders.execute('', '')
            ).rejects.toThrow();
        });
    });
});


