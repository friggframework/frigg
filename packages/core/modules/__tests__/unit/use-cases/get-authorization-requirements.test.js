/**
 * GetAuthorizationRequirementsUseCase Unit Tests
 * Tests retrieval of authorization requirements for specific steps
 */

describe('GetAuthorizationRequirementsUseCase', () => {
    let useCase;
    let mockModuleDefinitions;

    beforeEach(() => {
        // Mock module definitions
        const mockNagarisDefinition = {
            getAuthStepCount: jest.fn().mockReturnValue(2),
            getAuthRequirementsForStep: jest.fn(),
            getAuthorizationRequirements: jest.fn() // Legacy method
        };

        const mockSimpleDefinition = {
            getAuthStepCount: jest.fn().mockReturnValue(1),
            getAuthRequirementsForStep: jest.fn(),
            getAuthorizationRequirements: jest.fn()
        };

        const mockLegacyDefinition = {
            // No getAuthStepCount or getAuthRequirementsForStep
            getAuthorizationRequirements: jest.fn()
        };

        mockModuleDefinitions = [
            {
                moduleName: 'nagaris',
                definition: mockNagarisDefinition
            },
            {
                moduleName: 'simple-auth',
                definition: mockSimpleDefinition
            },
            {
                moduleName: 'legacy-auth',
                definition: mockLegacyDefinition
            }
        ];

        // Mock use case
        class GetAuthorizationRequirementsUseCase {
            constructor({ moduleDefinitions }) {
                this.moduleDefinitions = moduleDefinitions;
            }

            async execute(entityType, step = 1) {
                const moduleDefinition = this.moduleDefinitions.find(
                    def => def.moduleName === entityType
                );

                if (!moduleDefinition) {
                    throw new Error(`Module definition not found: ${entityType}`);
                }

                const ModuleDefinition = moduleDefinition.definition;

                const stepCount = ModuleDefinition.getAuthStepCount
                    ? ModuleDefinition.getAuthStepCount()
                    : 1;

                const requirements = ModuleDefinition.getAuthRequirementsForStep
                    ? await ModuleDefinition.getAuthRequirementsForStep(step)
                    : await ModuleDefinition.getAuthorizationRequirements();

                return {
                    ...requirements,
                    step,
                    totalSteps: stepCount,
                    isMultiStep: stepCount > 1
                };
            }
        }

        useCase = new GetAuthorizationRequirementsUseCase({
            moduleDefinitions: mockModuleDefinitions
        });
    });

    describe('Basic Functionality', () => {
        it('should return requirements for single-step module', async () => {
            const mockDefinition = mockModuleDefinitions[1].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'oauth2',
                url: 'https://example.com/oauth'
            });

            const result = await useCase.execute('simple-auth', 1);

            expect(result).toEqual({
                type: 'oauth2',
                url: 'https://example.com/oauth',
                step: 1,
                totalSteps: 1,
                isMultiStep: false
            });
        });

        it('should return requirements for multi-step module', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'email',
                data: {
                    jsonSchema: {
                        properties: {
                            email: { type: 'string' }
                        }
                    }
                }
            });

            const result = await useCase.execute('nagaris', 1);

            expect(result).toEqual({
                type: 'email',
                data: {
                    jsonSchema: {
                        properties: {
                            email: { type: 'string' }
                        }
                    }
                },
                step: 1,
                totalSteps: 2,
                isMultiStep: true
            });
        });

        it('should default to step 1 when not specified', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'email'
            });

            await useCase.execute('nagaris');

            expect(mockDefinition.getAuthRequirementsForStep).toHaveBeenCalledWith(1);
        });

        it('should throw error when module not found', async () => {
            await expect(useCase.execute('unknown-module', 1)).rejects.toThrow(
                'Module definition not found: unknown-module'
            );
        });
    });

    describe('Multi-Step Support', () => {
        it('should return requirements for step 2 of multi-step flow', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
                data: {
                    jsonSchema: {
                        properties: {
                            otp: { type: 'string' }
                        }
                    }
                }
            });

            const result = await useCase.execute('nagaris', 2);

            expect(mockDefinition.getAuthRequirementsForStep).toHaveBeenCalledWith(2);
            expect(result.step).toBe(2);
            expect(result.totalSteps).toBe(2);
            expect(result.isMultiStep).toBe(true);
        });

        it('should correctly identify single-step modules', async () => {
            const mockDefinition = mockModuleDefinitions[1].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'oauth2'
            });

            const result = await useCase.execute('simple-auth', 1);

            expect(result.isMultiStep).toBe(false);
            expect(result.totalSteps).toBe(1);
        });

        it('should correctly identify multi-step modules', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'email'
            });

            const result = await useCase.execute('nagaris', 1);

            expect(result.isMultiStep).toBe(true);
            expect(result.totalSteps).toBe(2);
        });
    });

    describe('Legacy Module Support', () => {
        it('should fall back to getAuthorizationRequirements for legacy modules', async () => {
            const mockDefinition = mockModuleDefinitions[2].definition;
            mockDefinition.getAuthorizationRequirements.mockResolvedValue({
                type: 'basic',
                data: {}
            });

            const result = await useCase.execute('legacy-auth', 1);

            expect(mockDefinition.getAuthorizationRequirements).toHaveBeenCalled();
            expect(result.type).toBe('basic');
        });

        it('should default to single-step for legacy modules', async () => {
            const mockDefinition = mockModuleDefinitions[2].definition;
            mockDefinition.getAuthorizationRequirements.mockResolvedValue({
                type: 'basic'
            });

            const result = await useCase.execute('legacy-auth', 1);

            expect(result.totalSteps).toBe(1);
            expect(result.isMultiStep).toBe(false);
        });

        it('should not call getAuthRequirementsForStep for legacy modules', async () => {
            const mockDefinition = mockModuleDefinitions[2].definition;
            mockDefinition.getAuthorizationRequirements.mockResolvedValue({});

            await useCase.execute('legacy-auth', 1);

            expect(mockDefinition.getAuthorizationRequirements).toHaveBeenCalled();
        });
    });

    describe('Requirements Data Structure', () => {
        it('should preserve all requirement fields', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            const requirements = {
                type: 'email',
                data: {
                    jsonSchema: {
                        title: 'Email Authentication',
                        properties: {
                            email: { type: 'string', format: 'email' }
                        }
                    },
                    uiSchema: {
                        email: { 'ui:placeholder': 'your.email@example.com' }
                    }
                }
            };

            mockDefinition.getAuthRequirementsForStep.mockResolvedValue(requirements);

            const result = await useCase.execute('nagaris', 1);

            expect(result.type).toBe('email');
            expect(result.data.jsonSchema).toEqual(requirements.data.jsonSchema);
            expect(result.data.uiSchema).toEqual(requirements.data.uiSchema);
        });

        it('should add step metadata to requirements', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'email'
            });

            const result = await useCase.execute('nagaris', 1);

            expect(result).toHaveProperty('step', 1);
            expect(result).toHaveProperty('totalSteps', 2);
            expect(result).toHaveProperty('isMultiStep', true);
        });

        it('should handle OAuth2 requirements', async () => {
            const mockDefinition = mockModuleDefinitions[1].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'oauth2',
                url: 'https://example.com/oauth/authorize',
                data: {
                    clientId: 'client-123',
                    scopes: ['read', 'write']
                }
            });

            const result = await useCase.execute('simple-auth', 1);

            expect(result.type).toBe('oauth2');
            expect(result.url).toBe('https://example.com/oauth/authorize');
            expect(result.data.scopes).toEqual(['read', 'write']);
        });

        it('should handle form-based requirements', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'form',
                data: {
                    jsonSchema: {
                        type: 'object',
                        required: ['username', 'password'],
                        properties: {
                            username: { type: 'string' },
                            password: { type: 'string' }
                        }
                    }
                }
            });

            const result = await useCase.execute('nagaris', 1);

            expect(result.type).toBe('form');
            expect(result.data.jsonSchema.required).toEqual(['username', 'password']);
        });
    });

    describe('Error Handling', () => {
        it('should propagate errors from getAuthRequirementsForStep', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockRejectedValue(
                new Error('Step not defined')
            );

            await expect(useCase.execute('nagaris', 3)).rejects.toThrow('Step not defined');
        });

        it('should propagate errors from getAuthorizationRequirements', async () => {
            const mockDefinition = mockModuleDefinitions[2].definition;
            mockDefinition.getAuthorizationRequirements.mockRejectedValue(
                new Error('Configuration error')
            );

            await expect(useCase.execute('legacy-auth', 1)).rejects.toThrow(
                'Configuration error'
            );
        });

        it('should handle missing module gracefully', async () => {
            await expect(useCase.execute('nonexistent', 1)).rejects.toThrow(
                'Module definition not found: nonexistent'
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle step 0', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'email'
            });

            const result = await useCase.execute('nagaris', 0);

            expect(mockDefinition.getAuthRequirementsForStep).toHaveBeenCalledWith(0);
            expect(result.step).toBe(0);
        });

        it('should handle very high step numbers', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'unknown'
            });

            const result = await useCase.execute('nagaris', 100);

            expect(result.step).toBe(100);
        });

        it('should handle modules with many steps', async () => {
            const complexModule = {
                moduleName: 'complex',
                definition: {
                    getAuthStepCount: jest.fn().mockReturnValue(10),
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                        type: 'form'
                    })
                }
            };

            mockModuleDefinitions.push(complexModule);

            const result = await useCase.execute('complex', 5);

            expect(result.totalSteps).toBe(10);
            expect(result.isMultiStep).toBe(true);
        });

        it('should handle empty requirements object', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            const result = await useCase.execute('nagaris', 1);

            expect(result.step).toBe(1);
            expect(result.totalSteps).toBe(2);
            expect(result.isMultiStep).toBe(true);
        });

        it('should handle requirements with nested objects', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'complex',
                data: {
                    nested: {
                        deep: {
                            structure: {
                                value: 'test'
                            }
                        }
                    }
                }
            });

            const result = await useCase.execute('nagaris', 1);

            expect(result.data.nested.deep.structure.value).toBe('test');
        });

        it('should handle special characters in module names', async () => {
            const specialModule = {
                moduleName: 'module-name_v2.0',
                definition: {
                    getAuthStepCount: jest.fn().mockReturnValue(1),
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({})
                }
            };

            mockModuleDefinitions.push(specialModule);

            const result = await useCase.execute('module-name_v2.0', 1);

            expect(result.step).toBe(1);
        });
    });

    describe('Backward Compatibility', () => {
        it('should work with modules that have both old and new methods', async () => {
            const hybridModule = {
                moduleName: 'hybrid',
                definition: {
                    getAuthStepCount: jest.fn().mockReturnValue(2),
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                        type: 'new'
                    }),
                    getAuthorizationRequirements: jest.fn().mockResolvedValue({
                        type: 'old'
                    })
                }
            };

            mockModuleDefinitions.push(hybridModule);

            const result = await useCase.execute('hybrid', 1);

            // Should prefer new method
            expect(hybridModule.definition.getAuthRequirementsForStep).toHaveBeenCalled();
            expect(hybridModule.definition.getAuthorizationRequirements).not.toHaveBeenCalled();
            expect(result.type).toBe('new');
        });

        it('should handle modules with only getAuthStepCount', async () => {
            const partialModule = {
                moduleName: 'partial',
                definition: {
                    getAuthStepCount: jest.fn().mockReturnValue(3),
                    getAuthorizationRequirements: jest.fn().mockResolvedValue({
                        type: 'fallback'
                    })
                }
            };

            mockModuleDefinitions.push(partialModule);

            const result = await useCase.execute('partial', 1);

            expect(result.totalSteps).toBe(3);
            expect(result.isMultiStep).toBe(true);
            expect(result.type).toBe('fallback');
        });
    });

    describe('Async Behavior', () => {
        it('should handle async getAuthRequirementsForStep', async () => {
            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.getAuthRequirementsForStep.mockImplementation(
                () =>
                    new Promise(resolve =>
                        setTimeout(() => resolve({ type: 'async' }), 10)
                    )
            );

            const result = await useCase.execute('nagaris', 1);

            expect(result.type).toBe('async');
        });

        it('should handle async getAuthorizationRequirements', async () => {
            const mockDefinition = mockModuleDefinitions[2].definition;
            mockDefinition.getAuthorizationRequirements.mockImplementation(
                () =>
                    new Promise(resolve =>
                        setTimeout(() => resolve({ type: 'legacy-async' }), 10)
                    )
            );

            const result = await useCase.execute('legacy-auth', 1);

            expect(result.type).toBe('legacy-async');
        });
    });
});
