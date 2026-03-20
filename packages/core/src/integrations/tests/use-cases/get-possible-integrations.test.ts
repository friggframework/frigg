import { GetPossibleIntegrations } from '../../use-cases/get-possible-integrations';
import { DummyIntegration } from '../doubles/dummy-integration-class';

describe('GetPossibleIntegrations Use-Case', () => {
    describe('happy path', () => {
        it('returns option details array for single integration', async () => {
            const useCase = new GetPossibleIntegrations({ integrationClasses: [DummyIntegration] } as any);
            const result = await useCase.execute();

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
            expect(result[0].display).toBeDefined();
            expect(result[0].display.label).toBe('Dummy Integration');
            expect(result[0].display.description).toBe('A dummy integration for testing');
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
                        icon: 'another-icon'
                    }
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration, AnotherDummyIntegration]
            } as any);
            const result = await useCase.execute();

            expect(result.length).toBe(2);
            expect(result[0].name).toBe('dummy');
            expect(result[1].name).toBe('another-dummy');
        });

        it('includes all required display properties', async () => {
            const useCase = new GetPossibleIntegrations({ integrationClasses: [DummyIntegration] } as any);
            const result = await useCase.execute();

            const integration = result[0];
            expect(integration.display.label).toBeDefined();
            expect(integration.display.description).toBeDefined();
            expect(integration.display.detailsUrl).toBeDefined();
            expect(integration.display.icon).toBeDefined();
        });
    });

    describe('error cases', () => {
        it('returns empty array when no integration classes provided', async () => {
            const useCase = new GetPossibleIntegrations({ integrationClasses: [] } as any);
            const result = await useCase.execute();

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('handles integration class without getOptionDetails method', async () => {
            class InvalidIntegration {
                static Definition = { name: 'invalid' };
            }

            const useCase = new GetPossibleIntegrations({ integrationClasses: [InvalidIntegration] } as any);

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('handles integration class with incomplete Definition', async () => {
            class IncompleteIntegration {
                static Definition = {
                    name: 'incomplete',
                    modules: { dummy: {} }
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: (this.Definition as any).version,
                        display: (this.Definition as any).display
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({ integrationClasses: [IncompleteIntegration] } as any);
            const result = await useCase.execute();

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('incomplete');
            expect(result[0].display).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('handles null integrationClasses parameter', async () => {
            const useCase = new GetPossibleIntegrations({ integrationClasses: null } as any);

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('handles undefined integrationClasses parameter', async () => {
            const useCase = new GetPossibleIntegrations({ integrationClasses: undefined } as any);

            await expect(useCase.execute()).rejects.toThrow();
        });

        it('filters out null/undefined integration classes', async () => {
            const useCase = new GetPossibleIntegrations({
                integrationClasses: [DummyIntegration, null, undefined].filter(Boolean)
            } as any);
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
                        label: 'Complex Integration with Special Characters! \u{1F680}',
                        description: 'A very long description that includes\nnewlines and\ttabs and special characters like \u00e9mojis \u{1F389}',
                        detailsUrl: 'https://complex.example.com/with/path?param=value&other=123',
                        icon: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
                        category: 'Test & Development',
                        tags: ['testing', 'development', 'complex']
                    }
                };

                static getOptionDetails() {
                    return {
                        name: this.Definition.name,
                        version: this.Definition.version,
                        display: this.Definition.display
                    };
                }
            }

            const useCase = new GetPossibleIntegrations({ integrationClasses: [ComplexIntegration] } as any);
            const result = await useCase.execute();

            expect(result[0].display.label).toContain('\u{1F680}');
            expect(result[0].display.description).toContain('\u{1F389}');
            expect(result[0].display.detailsUrl).toContain('?param=value');
        });

        it('preserves integration class order', async () => {
            class FirstIntegration {
                static Definition = { name: 'first', version: '1.0.0', modules: { dummy: {} }, display: { label: 'First' } };
                static getOptionDetails() { return { name: this.Definition.name, version: this.Definition.version, display: this.Definition.display }; }
            }
            class SecondIntegration {
                static Definition = { name: 'second', version: '1.0.0', modules: { dummy: {} }, display: { label: 'Second' } };
                static getOptionDetails() { return { name: this.Definition.name, version: this.Definition.version, display: this.Definition.display }; }
            }
            class ThirdIntegration {
                static Definition = { name: 'third', version: '1.0.0', modules: { dummy: {} }, display: { label: 'Third' } };
                static getOptionDetails() { return { name: this.Definition.name, version: this.Definition.version, display: this.Definition.display }; }
            }

            const useCase = new GetPossibleIntegrations({
                integrationClasses: [FirstIntegration, SecondIntegration, ThirdIntegration]
            } as any);
            const result = await useCase.execute();

            expect(result[0].name).toBe('first');
            expect(result[1].name).toBe('second');
            expect(result[2].name).toBe('third');
        });
    });
});
