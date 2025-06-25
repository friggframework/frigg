const fetch = require('node-fetch');
const { debug, error } = require('../../logs');

class IntegrationDiscoveryService {
    constructor() {
        this.npmRegistryUrl = 'https://registry.npmjs.org';
        this.cacheTimeout = 1000 * 60 * 60; // 1 hour cache
        this.cache = new Map();
    }

    /**
     * Search npm registry for @friggframework integration modules
     * @param {Object} options - Search options
     * @param {string} options.query - Search query
     * @param {number} options.limit - Number of results to return
     * @param {number} options.offset - Offset for pagination
     * @returns {Promise<Object>} Search results with metadata
     */
    async searchIntegrations({ query = '', limit = 20, offset = 0 } = {}) {
        const cacheKey = `search:${query}:${limit}:${offset}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // Search for packages in the @friggframework scope
            const searchQuery = query 
                ? `@friggframework/${query}` 
                : '@friggframework';
            
            const searchUrl = `${this.npmRegistryUrl}/-/v1/search?text=${encodeURIComponent(searchQuery)}&size=${limit}&from=${offset}`;
            
            debug(`Searching npm registry: ${searchUrl}`);
            
            const response = await fetch(searchUrl);
            if (!response.ok) {
                throw new Error(`NPM search failed: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Filter to only include actual integration packages
            const integrations = await Promise.all(
                data.objects
                    .filter(pkg => this.isIntegrationPackage(pkg))
                    .map(async pkg => await this.enrichPackageData(pkg))
            );

            const result = {
                total: data.total,
                integrations,
                hasMore: offset + limit < data.total
            };

            this.setCache(cacheKey, result);
            return result;

        } catch (err) {
            error('Integration discovery search failed:', err);
            throw new Error(`Failed to search integrations: ${err.message}`);
        }
    }

    /**
     * Get detailed information about a specific integration package
     * @param {string} packageName - Full package name (e.g., @friggframework/api-module-hubspot)
     * @returns {Promise<Object>} Detailed package information
     */
    async getIntegrationDetails(packageName) {
        const cacheKey = `details:${packageName}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const packageUrl = `${this.npmRegistryUrl}/${encodeURIComponent(packageName)}`;
            debug(`Fetching package details: ${packageUrl}`);
            
            const response = await fetch(packageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch package details: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Extract relevant information
            const details = {
                name: data.name,
                version: data['dist-tags']?.latest || 'unknown',
                description: data.description,
                keywords: data.keywords || [],
                author: data.author,
                license: data.license,
                homepage: data.homepage,
                repository: data.repository,
                dependencies: data.versions?.[data['dist-tags']?.latest]?.dependencies || {},
                peerDependencies: data.versions?.[data['dist-tags']?.latest]?.peerDependencies || {},
                publishedAt: data.time?.[data['dist-tags']?.latest],
                maintainers: data.maintainers || [],
                readme: data.readme,
                // Extract integration-specific metadata
                integrationMetadata: this.extractIntegrationMetadata(data)
            };

            this.setCache(cacheKey, details);
            return details;

        } catch (err) {
            error('Failed to get integration details:', err);
            throw new Error(`Failed to get integration details: ${err.message}`);
        }
    }

    /**
     * Get all available @friggframework integrations
     * @returns {Promise<Array>} List of all available integrations
     */
    async getAllIntegrations() {
        const cacheKey = 'all-integrations';
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const allIntegrations = [];
            let offset = 0;
            const limit = 250; // NPM max
            let hasMore = true;

            while (hasMore) {
                const result = await this.searchIntegrations({ 
                    query: 'api-module', 
                    limit, 
                    offset 
                });
                
                allIntegrations.push(...result.integrations);
                hasMore = result.hasMore;
                offset += limit;
            }

            // Categorize integrations
            const categorized = this.categorizeIntegrations(allIntegrations);
            
            this.setCache(cacheKey, categorized);
            return categorized;

        } catch (err) {
            error('Failed to get all integrations:', err);
            throw new Error(`Failed to get all integrations: ${err.message}`);
        }
    }

    /**
     * Check if a package is an integration package
     * @param {Object} pkg - NPM package object
     * @returns {boolean}
     */
    isIntegrationPackage(pkg) {
        const name = pkg.package.name;
        const keywords = pkg.package.keywords || [];
        
        return (
            name.startsWith('@friggframework/api-module-') ||
            keywords.includes('frigg-integration') ||
            keywords.includes('frigg-api-module')
        );
    }

    /**
     * Enrich package data with additional information
     * @param {Object} pkg - NPM search result package
     * @returns {Promise<Object>} Enriched package data
     */
    async enrichPackageData(pkg) {
        const packageData = pkg.package;
        
        // Extract integration name from package name
        const integrationName = packageData.name
            .replace('@friggframework/api-module-', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());

        return {
            name: packageData.name,
            displayName: integrationName,
            version: packageData.version,
            description: packageData.description,
            keywords: packageData.keywords || [],
            author: packageData.author,
            date: packageData.date,
            links: packageData.links || {},
            category: this.determineCategory(packageData),
            logoUrl: await this.getIntegrationLogoUrl(packageData.name),
            installCommand: `npm install ${packageData.name}`,
            isOfficial: this.isOfficialIntegration(packageData)
        };
    }

    /**
     * Extract integration-specific metadata from package data
     * @param {Object} data - Full package data from NPM
     * @returns {Object} Integration metadata
     */
    extractIntegrationMetadata(data) {
        const latestVersion = data['dist-tags']?.latest;
        const versionData = data.versions?.[latestVersion] || {};
        
        // Look for frigg-specific configuration in package.json
        const friggConfig = versionData.frigg || {};
        
        return {
            authType: friggConfig.authType || this.inferAuthType(data.name),
            apiVersion: friggConfig.apiVersion,
            supportedFeatures: friggConfig.features || [],
            requiredScopes: friggConfig.requiredScopes || [],
            webhooksSupported: friggConfig.webhooks || false,
            sandboxAvailable: friggConfig.sandbox || false,
            documentationUrl: friggConfig.docs || data.homepage,
            category: friggConfig.category || this.determineCategory(data)
        };
    }

    /**
     * Determine the category of an integration
     * @param {Object} packageData - Package data
     * @returns {string} Category name
     */
    determineCategory(packageData) {
        const name = packageData.name.toLowerCase();
        const keywords = (packageData.keywords || []).map(k => k.toLowerCase());
        const description = (packageData.description || '').toLowerCase();
        
        const categoryPatterns = {
            'CRM': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive'],
            'Communication': ['email', 'sms', 'chat', 'slack', 'discord', 'teams'],
            'E-commerce': ['ecommerce', 'shop', 'store', 'payment', 'stripe', 'paypal'],
            'Marketing': ['marketing', 'campaign', 'mailchimp', 'activecampaign'],
            'Productivity': ['task', 'project', 'asana', 'trello', 'notion', 'jira'],
            'Analytics': ['analytics', 'tracking', 'google', 'mixpanel', 'segment'],
            'Support': ['support', 'helpdesk', 'ticket', 'zendesk', 'intercom'],
            'Finance': ['accounting', 'invoice', 'quickbooks', 'xero', 'billing'],
            'Developer Tools': ['github', 'gitlab', 'bitbucket', 'api', 'webhook'],
            'Social Media': ['social', 'facebook', 'twitter', 'instagram', 'linkedin']
        };

        for (const [category, patterns] of Object.entries(categoryPatterns)) {
            for (const pattern of patterns) {
                if (name.includes(pattern) || 
                    keywords.includes(pattern) || 
                    description.includes(pattern)) {
                    return category;
                }
            }
        }

        return 'Other';
    }

    /**
     * Infer authentication type from package name or metadata
     * @param {string} packageName - Package name
     * @returns {string} Auth type (oauth2, api-key, basic, etc.)
     */
    inferAuthType(packageName) {
        const name = packageName.toLowerCase();
        
        // Known OAuth2 integrations
        const oauth2Integrations = ['hubspot', 'salesforce', 'google', 'slack', 'discord'];
        if (oauth2Integrations.some(integration => name.includes(integration))) {
            return 'oauth2';
        }

        // Known API key integrations
        const apiKeyIntegrations = ['stripe', 'sendgrid', 'twilio', 'openai'];
        if (apiKeyIntegrations.some(integration => name.includes(integration))) {
            return 'api-key';
        }

        return 'unknown';
    }

    /**
     * Get logo URL for an integration
     * @param {string} packageName - Package name
     * @returns {Promise<string>} Logo URL
     */
    async getIntegrationLogoUrl(packageName) {
        // Extract integration name
        const integrationName = packageName
            .replace('@friggframework/api-module-', '')
            .toLowerCase();

        // Try to fetch from a CDN or use a placeholder
        // In a real implementation, this might query a logo service
        const knownLogos = {
            'hubspot': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/hubspot.svg',
            'salesforce': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/salesforce.svg',
            'slack': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg',
            'stripe': 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/stripe.svg',
            // Add more as needed
        };

        return knownLogos[integrationName] || null;
    }

    /**
     * Check if an integration is officially maintained
     * @param {Object} packageData - Package data
     * @returns {boolean}
     */
    isOfficialIntegration(packageData) {
        const author = packageData.author;
        const maintainers = packageData.maintainers || [];
        
        // Check if authored or maintained by official Frigg team
        return (
            (author && author.name && author.name.includes('Frigg')) ||
            maintainers.some(m => m.name && m.name.includes('frigg'))
        );
    }

    /**
     * Categorize integrations into groups
     * @param {Array} integrations - List of integrations
     * @returns {Object} Categorized integrations
     */
    categorizeIntegrations(integrations) {
        const categorized = {
            byCategory: {},
            byAuthType: {},
            all: integrations,
            total: integrations.length
        };

        for (const integration of integrations) {
            // By category
            const category = integration.category || 'Other';
            if (!categorized.byCategory[category]) {
                categorized.byCategory[category] = [];
            }
            categorized.byCategory[category].push(integration);

            // By auth type
            const authType = integration.integrationMetadata?.authType || 'unknown';
            if (!categorized.byAuthType[authType]) {
                categorized.byAuthType[authType] = [];
            }
            categorized.byAuthType[authType].push(integration);
        }

        return categorized;
    }

    /**
     * Get from cache if not expired
     * @param {string} key - Cache key
     * @returns {any} Cached value or null
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            debug(`Cache hit for: ${key}`);
            return cached.data;
        }
        return null;
    }

    /**
     * Set cache value
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

module.exports = IntegrationDiscoveryService;