const { ApiModuleValidator } = require('../../infrastructure/validators/api-module-validator');

describe('ApiModuleValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new ApiModuleValidator();
    });

    describe('valid modules', () => {
        it('validates integration with no modules', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0'
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(true);
            expect(result.getErrors()).toHaveLength(0);
        });

        it('validates integration with valid module definition', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    hubspot: {
                        definition: {
                            moduleName: 'hubspot',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function', async: true },
                                getCredentialDetails: { type: 'function', async: true },
                                getEntityDetails: { type: 'function', async: true },
                                apiPropertiesToPersist: {
                                    credential: ['access_token', 'refresh_token'],
                                    entity: ['external_id', 'name']
                                }
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(true);
        });

        it('validates multiple modules', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    source: {
                        definition: {
                            moduleName: 'source-api',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function', async: true },
                                getCredentialDetails: { type: 'function', async: true },
                                getEntityDetails: { type: 'function', async: true },
                                apiPropertiesToPersist: {
                                    credential: ['token'],
                                    entity: ['id']
                                }
                            }
                        }
                    },
                    target: {
                        definition: {
                            moduleName: 'target-api',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function', async: true },
                                getCredentialDetails: { type: 'function', async: true },
                                getEntityDetails: { type: 'function', async: true },
                                apiPropertiesToPersist: {
                                    credential: ['api_key'],
                                    entity: ['external_id']
                                }
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(true);
        });
    });

    describe('missing definition', () => {
        it('errors when module lacks definition property', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    hubspot: {
                        // missing definition
                    }
                }
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors().some(e => e.code === 'MISSING_DEFINITION')).toBe(true);
        });
    });

    describe('schema validation', () => {
        it('errors when moduleName is missing', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    hubspot: {
                        definition: {
                            // missing moduleName
                            getName: { type: 'function' },
                            requiredAuthMethods: {}
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors().some(e =>
                e.path.includes('definition') && e.message.includes('moduleName')
            )).toBe(true);
        });

        it('errors when moduleName has invalid pattern', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    test: {
                        definition: {
                            moduleName: '123-invalid', // must start with letter
                            getName: { type: 'function' },
                            requiredAuthMethods: {}
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            expect(result.isValid()).toBe(false);
        });
    });

    describe('method validation', () => {
        it('warns when getToken is missing', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    test: {
                        definition: {
                            moduleName: 'test-module',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getCredentialDetails: { type: 'function' },
                                getEntityDetails: { type: 'function' }
                                // missing getToken
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            const warnings = result.getWarnings();
            expect(warnings.some(w =>
                w.code === 'MISSING_METHOD' && w.message.includes('getToken')
            )).toBe(true);
        });

        it('warns when getEntityDetails is missing', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    test: {
                        definition: {
                            moduleName: 'test-module',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function' },
                                getCredentialDetails: { type: 'function' }
                                // missing getEntityDetails
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            const warnings = result.getWarnings();
            expect(warnings.some(w =>
                w.code === 'MISSING_METHOD' && w.message.includes('getEntityDetails')
            )).toBe(true);
        });
    });

    describe('apiPropertiesToPersist validation', () => {
        it('warns when credential properties are missing', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    test: {
                        definition: {
                            moduleName: 'test-module',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function' },
                                getCredentialDetails: { type: 'function' },
                                getEntityDetails: { type: 'function' },
                                apiPropertiesToPersist: {
                                    credential: [], // empty
                                    entity: ['external_id']
                                }
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            const warnings = result.getWarnings();
            expect(warnings.some(w => w.code === 'MISSING_CREDENTIAL_PROPS')).toBe(true);
        });

        it('warns when entity properties are missing', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    test: {
                        definition: {
                            moduleName: 'test-module',
                            getName: { type: 'function' },
                            requiredAuthMethods: {
                                getToken: { type: 'function' },
                                getCredentialDetails: { type: 'function' },
                                getEntityDetails: { type: 'function' },
                                apiPropertiesToPersist: {
                                    credential: ['access_token'],
                                    entity: [] // empty
                                }
                            }
                        }
                    }
                }
            };

            const result = validator.validate(definition, 0);
            const warnings = result.getWarnings();
            expect(warnings.some(w => w.code === 'MISSING_ENTITY_PROPS')).toBe(true);
        });
    });

    describe('path formatting', () => {
        it('includes correct path prefix for errors', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0',
                modules: {
                    myModule: {
                        definition: {
                            // missing required fields
                        }
                    }
                }
            };

            const result = validator.validate(definition, 2);
            const errors = result.getErrors();
            expect(errors[0].path).toContain('integrations[2].Definition.modules.myModule');
        });
    });

    describe('result type', () => {
        it('returns ValidationResult instance', () => {
            const definition = {
                name: 'test-integration',
                version: '1.0.0'
            };

            const result = validator.validate(definition, 0);
            expect(result.constructor.name).toBe('ValidationResult');
        });
    });
});
