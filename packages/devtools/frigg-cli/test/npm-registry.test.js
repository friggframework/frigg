const axios = require('axios');

// Mock dependencies
jest.mock('axios');
jest.mock('node-cache');

describe('NPMRegistryService', () => {
    let npmRegistry;
    let mockCache;
    let NodeCache;
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock cache methods
        mockCache = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
        };
        
        // Re-require NodeCache and set up mock
        NodeCache = require('node-cache');
        NodeCache.mockImplementation(() => mockCache);
        
        // Create new instance for each test
        jest.isolateModules(() => {
            npmRegistry = require('../utils/npm-registry');
            // Access the cache directly to ensure our mock is used
            npmRegistry.cache = mockCache;
        });
    });

    describe('searchApiModules', () => {
        const mockApiResponse = {
            data: {
                objects: [
                    {
                        package: {
                            name: '@friggframework/api-module-slack',
                            version: '2.0.0',
                            description: 'Slack integration for Frigg',
                            keywords: ['frigg', 'slack', 'integration'],
                            author: { name: 'Frigg Team' },
                            date: '2024-01-01'
                        }
                    },
                    {
                        package: {
                            name: '@friggframework/api-module-hubspot',
                            version: '2.1.0',
                            description: 'HubSpot CRM integration',
                            keywords: ['frigg', 'hubspot', 'crm'],
                            author: { name: 'Frigg Team' },
                            date: '2024-01-02'
                        }
                    },
                    {
                        package: {
                            name: '@friggframework/not-api-module',
                            version: '1.0.0',
                            description: 'Should be filtered out'
                        }
                    }
                ]
            }
        };

        it('should fetch and format API modules from npm registry', async () => {
            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue(mockApiResponse);

            const result = await npmRegistry.searchApiModules();

            expect(axios.get).toHaveBeenCalledWith(
                'https://registry.npmjs.org/-/v1/search',
                expect.objectContaining({
                    params: expect.objectContaining({
                        text: '@friggframework/api-module-',
                        size: 250
                    }),
                    timeout: 10000
                })
            );

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                name: '@friggframework/api-module-slack',
                version: '2.0.0',
                integrationName: 'Slack',
                category: 'Communication'
            });
            expect(result[1]).toMatchObject({
                name: '@friggframework/api-module-hubspot',
                integrationName: 'Hubspot',
                category: 'CRM'
            });
        });

        it('should use cached results when available', async () => {
            const cachedData = [{ name: 'cached-module' }];
            mockCache.get.mockReturnValue(cachedData);

            const result = await npmRegistry.searchApiModules();

            expect(axios.get).not.toHaveBeenCalled();
            expect(result).toEqual(cachedData);
        });

        it('should force refresh when requested', async () => {
            const cachedData = [{ name: 'cached-module' }];
            mockCache.get.mockReturnValue(cachedData);
            axios.get.mockResolvedValue(mockApiResponse);

            const result = await npmRegistry.searchApiModules({ forceRefresh: true });

            expect(axios.get).toHaveBeenCalled();
            expect(result).toHaveLength(2);
        });

        it('should filter out prerelease versions by default', async () => {
            const responseWithPrerelease = {
                data: {
                    objects: [
                        {
                            package: {
                                name: '@friggframework/api-module-test',
                                version: '2.0.0-beta.1',
                                description: 'Prerelease version'
                            }
                        },
                        {
                            package: {
                                name: '@friggframework/api-module-stable',
                                version: '1.0.0',
                                description: 'Stable version'
                            }
                        }
                    ]
                }
            };

            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue(responseWithPrerelease);

            const result = await npmRegistry.searchApiModules();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('@friggframework/api-module-stable');
        });

        it('should include prerelease versions when requested', async () => {
            const responseWithPrerelease = {
                data: {
                    objects: [
                        {
                            package: {
                                name: '@friggframework/api-module-test',
                                version: '2.0.0-beta.1'
                            }
                        }
                    ]
                }
            };

            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue(responseWithPrerelease);

            const result = await npmRegistry.searchApiModules({ includePrerelease: true });

            expect(result).toHaveLength(1);
            expect(result[0].version).toBe('2.0.0-beta.1');
        });

        it('should handle network errors gracefully', async () => {
            mockCache.get.mockReturnValue(null);
            axios.get.mockRejectedValue(new Error('Network error'));

            const result = await npmRegistry.searchApiModules();

            expect(result).toEqual([]);
        });

        it('should cache results after successful fetch', async () => {
            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue(mockApiResponse);

            await npmRegistry.searchApiModules();

            expect(mockCache.set).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([
                    expect.objectContaining({ name: '@friggframework/api-module-slack' })
                ])
            );
        });
    });

    describe('categorizeModule', () => {
        it('should categorize modules based on keywords and name', async () => {
            const testCases = [
                { name: '@friggframework/api-module-salesforce', keywords: ['crm'], expected: 'CRM' },
                { name: '@friggframework/api-module-slack', keywords: ['chat'], expected: 'Communication' },
                { name: '@friggframework/api-module-stripe', keywords: ['payment'], expected: 'E-commerce' },
                { name: '@friggframework/api-module-google-analytics', keywords: [], expected: 'Analytics' },
                { name: '@friggframework/api-module-mailchimp', keywords: ['email', 'marketing'], expected: 'Marketing' },
                { name: '@friggframework/api-module-facebook', keywords: [], expected: 'Social Media' },
                { name: '@friggframework/api-module-jira', keywords: ['project'], expected: 'Project Management' },
                { name: '@friggframework/api-module-dropbox', keywords: ['storage'], expected: 'Storage' },
                { name: '@friggframework/api-module-airtable', keywords: [], expected: 'Productivity' },
                { name: '@friggframework/api-module-github', keywords: ['git'], expected: 'Development' },
                { name: '@friggframework/api-module-zendesk', keywords: ['support'], expected: 'Support' },
                { name: '@friggframework/api-module-quickbooks', keywords: ['accounting'], expected: 'Finance' },
                { name: '@friggframework/api-module-unknown', keywords: [], expected: 'Other' }
            ];

            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue({
                data: {
                    objects: testCases.map(tc => ({
                        package: {
                            name: tc.name,
                            version: '1.0.0',
                            keywords: tc.keywords
                        }
                    }))
                }
            });

            const results = await npmRegistry.searchApiModules();

            testCases.forEach((testCase, index) => {
                expect(results[index].category).toBe(testCase.expected);
            });
        });
    });

    describe('getModulesByType', () => {
        it('should group modules by category', async () => {
            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue({
                data: {
                    objects: [
                        {
                            package: {
                                name: '@friggframework/api-module-slack',
                                version: '1.0.0',
                                keywords: ['chat', 'communication']
                            }
                        },
                        {
                            package: {
                                name: '@friggframework/api-module-discord',
                                version: '1.0.0',
                                keywords: ['chat', 'communication']
                            }
                        },
                        {
                            package: {
                                name: '@friggframework/api-module-salesforce',
                                version: '1.0.0',
                                keywords: ['crm']
                            }
                        }
                    ]
                }
            });

            const grouped = await npmRegistry.getModulesByType();

            expect(grouped).toMatchObject({
                'Communication': expect.arrayContaining([
                    expect.objectContaining({ name: '@friggframework/api-module-slack' }),
                    expect.objectContaining({ name: '@friggframework/api-module-discord' })
                ]),
                'CRM': expect.arrayContaining([
                    expect.objectContaining({ name: '@friggframework/api-module-salesforce' })
                ])
            });

            expect(grouped['Communication']).toHaveLength(2);
            expect(grouped['CRM']).toHaveLength(1);
        });

        it('should handle empty results', async () => {
            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue({ data: { objects: [] } });

            const grouped = await npmRegistry.getModulesByType();

            expect(grouped).toEqual({});
        });
    });

    describe('extractIntegrationName', () => {
        it('should extract and format integration names correctly', async () => {
            const testCases = [
                { input: '@friggframework/api-module-slack', expected: 'Slack' },
                { input: '@friggframework/api-module-google-sheets', expected: 'Google Sheets' },
                { input: '@friggframework/api-module-hubspot-crm', expected: 'Hubspot Crm' }
            ];

            mockCache.get.mockReturnValue(null);
            axios.get.mockResolvedValue({
                data: {
                    objects: testCases.map(tc => ({
                        package: { name: tc.input, version: '1.0.0' }
                    }))
                }
            });

            const results = await npmRegistry.searchApiModules();

            testCases.forEach((testCase, index) => {
                expect(results[index].integrationName).toBe(testCase.expected);
            });
        });
    });
});