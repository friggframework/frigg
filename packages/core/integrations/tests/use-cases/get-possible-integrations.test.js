const {
    GetPossibleIntegrations,
} = require('../../use-cases/get-possible-integrations');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('GetPossibleIntegrations Use-Case', () => {
    describe('happy path', () => {
        it('returns option details array for single integration', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration],
            });
            const result = await useCase.execute();

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0].display).toBeDefined();
            // Options class maps display.label → display.name
            expect(result[0].display.name).toBe('Dummy Integration');
            expect(result[0].display.description).toBe(
                'A dummy integration for testing'
            );
            expect(result[0].name).toBe('dummy');
            expect(result[0].version).toBe('1.0.0');
        });

        it('returns multiple integration options', async () => {
            class AnotherDummyIntegration {
                static Definition = {
                    name: 'another-dummy',
                    version: '2.0.0',
                    modules: { dummy: {} },
                    display: {
                        label: 'Another Dummy',
                        description: 'Another test integration',
                        detailsUrl: 'https://another.example.com',
                        icon: 'another-icon',
                    },
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration, AnotherDummyIntegration],
            });
            const result = await useCase.execute();

            expect(result.length).toBe(2);
            expect(result[0].name).toBe('dummy');
            expect(result[1].name).toBe('another-dummy');
        });

        it('includes all required display properties', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration],
            });
            const result = await useCase.execute();

            const integration = result[0];
            // Required fields
            expect(integration.display.name).toBeDefined();
            expect(integration.display.description).toBeDefined();
            // Optional fields (DummyIntegration has them, but they're not required)
            expect(integration.display.detailsUrl).toBeDefined();
            expect(integration.display.icon).toBeDefined();
        });

        it('works with minimal display configuration (only required fields)', async () => {
            class MinimalIntegration {
                static Definition = {
                    name: 'minimal',
                    version: '1.0.0',
                    modules: {
                        dummy: { definition: { getName: () => 'dummy' } },
                    },
                    display: {
                        label: 'Minimal',
                        description: 'A minimal integration',
                    },
                };

                static getOptionDetails() {
                    const { Options } = require('../../options');
                    const options = new Options({
                        module: Object.values(this.Definition.modules)[0],
                        ...this.Definition,
                    });
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        ...options.get(),
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [MinimalIntegration],
            });
            const result = await useCase.execute();

            expect(result.length).toBe(1);
            expect(result[0].display.name).toBe('Minimal');
            expect(result[0].display.description).toBe('A minimal integration');
            expect(result[0].display.detailsUrl).toBeNull();
            expect(result[0].display.icon).toBeNull();
        });
    });

    describe('error cases', () => {
        it('returns empty array when no integration classes provided', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [],
            });
            const result = await useCase.execute();

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('handles integration class without getOptionDetails method', async () => {
            class InvalidIntegration {
                static Definition = { name: 'invalid' };
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [InvalidIntegration],
            });

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('handles integration class with incomplete Definition', async () => {
            class IncompleteIntegration {
                static Definition = {
                    name: 'incomplete',
                    modules: { dummy: {} },
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [IncompleteIntegration],
            });
            const result = await useCase.execute();

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('incomplete');
            expect(result[0].display).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('handles null integrationClasses parameter', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: null,
            });

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('handles undefined integrationClasses parameter', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: undefined,
            });

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('filters out null/undefined integration classes', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration, null, undefined].filter(
                    Boolean
                ),
            });
            const result = await useCase.execute();

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('dummy');
        });

        it('handles integration with complex display properties', async () => {
            class ComplexIntegration {
                static Definition = {
                    name: 'complex',
                    version: '3.0.0',
                    modules: { dummy: {} },
                    display: {
                        label: 'Complex Integration with Special Characters! 🚀',
                        description:
                            'A very long description that includes\nnewlines and\ttabs and special characters like émojis 🎉',
                        detailsUrl:
                            'https://complex.example.com/with/path?param=value&other=123',
                        icon: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
                        category: 'Test & Development',
                        tags: ['testing', 'development', 'complex'],
                    },
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [ComplexIntegration],
            });
            const result = await useCase.execute();

            expect(result[0].display.label).toContain('🚀');
            expect(result[0].display.description).toContain('🎉');
            expect(result[0].display.detailsUrl).toContain('?param=value');
        });

        it('preserves integration class order', async () => {
            class FirstIntegration {
                static Definition = {
                    name: 'first',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'First' },
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }
            class SecondIntegration {
                static Definition = {
                    name: 'second',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Second' },
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }
            class ThirdIntegration {
                static Definition = {
                    name: 'third',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Third' },
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [
                    FirstIntegration,
                    SecondIntegration,
                    ThirdIntegration,
                ],
            });
            const result = await useCase.execute();

            expect(result[0].name).toBe('first');
            expect(result[1].name).toBe('second');
            expect(result[2].name).toBe('third');
        });
    });

    describe('visibility filtering', () => {
        it('shows all integrations when no visible function defined', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration],
            });
            const result = await useCase.execute({ user: { plan: 'free' } });

            expect(result.length).toBe(1);
        });

        it('filters integrations based on visible function returning true', async () => {
            class VisibleIntegration {
                static Definition = {
                    name: 'visible',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Visible' },
                    visible: () => true,
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [VisibleIntegration],
            });
            const result = await useCase.execute({ user: { plan: 'free' } });

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('visible');
        });

        it('filters out integrations when visible function returns false', async () => {
            class HiddenIntegration {
                static Definition = {
                    name: 'hidden',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Hidden' },
                    visible: () => false,
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [HiddenIntegration],
            });
            const result = await useCase.execute({ user: { plan: 'premium' } });

            expect(result.length).toBe(0);
        });

        it('passes context to visible function', async () => {
            class PremiumIntegration {
                static Definition = {
                    name: 'premium',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Premium' },
                    visible: (ctx) => ctx?.user?.plan === 'premium',
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [PremiumIntegration],
            });

            // Free user should not see premium integration
            const freeResult = await useCase.execute({ user: { plan: 'free' } });
            expect(freeResult.length).toBe(0);

            // Premium user should see it
            const premiumResult = await useCase.execute({ user: { plan: 'premium' } });
            expect(premiumResult.length).toBe(1);
            expect(premiumResult[0].name).toBe('premium');
        });

        it('supports async visible functions', async () => {
            class AsyncVisibleIntegration {
                static Definition = {
                    name: 'async-visible',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Async Visible' },
                    visible: async (ctx) => {
                        // Simulate async check
                        await new Promise((resolve) => setTimeout(resolve, 10));
                        return ctx?.user?.hasAccess === true;
                    },
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [AsyncVisibleIntegration],
            });

            const noAccessResult = await useCase.execute({ user: { hasAccess: false } });
            expect(noAccessResult.length).toBe(0);

            const hasAccessResult = await useCase.execute({ user: { hasAccess: true } });
            expect(hasAccessResult.length).toBe(1);
        });

        it('hides integration when visible function throws error', async () => {
            class ErrorIntegration {
                static Definition = {
                    name: 'error',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Error' },
                    visible: () => {
                        throw new Error('Visibility check failed');
                    },
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [ErrorIntegration],
            });

            // Should not throw, should just hide the integration
            const result = await useCase.execute({ user: {} });
            expect(result.length).toBe(0);
        });

        it('filters correctly with mixed visible and non-visible integrations', async () => {
            class PublicIntegration {
                static Definition = {
                    name: 'public',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Public' },
                    // No visible function = always visible
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            class PremiumOnlyIntegration {
                static Definition = {
                    name: 'premium-only',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Premium Only' },
                    visible: (ctx) => ctx?.user?.plan === 'premium',
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            class BetaIntegration {
                static Definition = {
                    name: 'beta',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Beta' },
                    visible: (ctx) => ctx?.user?.isBetaTester === true,
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [
                    PublicIntegration,
                    PremiumOnlyIntegration,
                    BetaIntegration,
                ],
            });

            // Free user sees only public
            const freeResult = await useCase.execute({ user: { plan: 'free' } });
            expect(freeResult.length).toBe(1);
            expect(freeResult[0].name).toBe('public');

            // Premium user sees public + premium
            const premiumResult = await useCase.execute({ user: { plan: 'premium' } });
            expect(premiumResult.length).toBe(2);
            expect(premiumResult.map((r) => r.name)).toContain('public');
            expect(premiumResult.map((r) => r.name)).toContain('premium-only');

            // Beta tester sees public + beta
            const betaResult = await useCase.execute({
                user: { plan: 'free', isBetaTester: true },
            });
            expect(betaResult.length).toBe(2);
            expect(betaResult.map((r) => r.name)).toContain('public');
            expect(betaResult.map((r) => r.name)).toContain('beta');

            // Premium beta tester sees all
            const allAccessResult = await useCase.execute({
                user: { plan: 'premium', isBetaTester: true },
            });
            expect(allAccessResult.length).toBe(3);
        });

        it('shows all integrations when context is null', async () => {
            class ConditionalIntegration {
                static Definition = {
                    name: 'conditional',
                    version: '1.0.0',
                    modules: { dummy: {} },
                    display: { label: 'Conditional' },
                    visible: (ctx) => ctx?.user?.plan === 'premium',
                };
                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display,
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration, ConditionalIntegration],
            });

            // With null context, conditional visibility returns false
            const result = await useCase.execute(null);
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('dummy');
        });
    });
});
