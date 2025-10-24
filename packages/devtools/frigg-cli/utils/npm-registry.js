/**
 * NPM Registry Service for CLI
 * CommonJS version of the npm-registry service
 */

'use strict';

const axios = require('axios');
const NodeCache = require('node-cache');
const semver = require('semver');

class NPMRegistryService {
    constructor() {
        // Cache with 1 hour TTL by default
        this.cache = new NodeCache({ 
            stdTTL: 3600,
            checkperiod: 600,
            useClones: false
        });
        
        this.npmRegistryUrl = 'https://registry.npmjs.org';
        this.searchUrl = `${this.npmRegistryUrl}/-/v1/search`;
        this.packageScope = '@friggframework';
        this.modulePrefix = 'api-module-';
    }

    /**
     * Search for all @friggframework/api-module-* packages
     * @param {Object} options - Search options
     * @param {boolean} options.includePrerelease - Include prerelease versions
     * @param {boolean} options.forceRefresh - Force cache refresh
     * @returns {Promise<Array>} Array of package information
     */
    async searchApiModules(options = {}) {
        const cacheKey = `api-modules-${JSON.stringify(options)}`;
        
        // Check cache first unless force refresh is requested
        if (!options.forceRefresh) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        try {
            // Search for packages matching our pattern
            const searchQuery = `${this.packageScope}/${this.modulePrefix}`;
            const response = await axios.get(this.searchUrl, {
                params: {
                    text: searchQuery,
                    size: 250, // Get up to 250 results
                    quality: 0.65,
                    popularity: 0.98,
                    maintenance: 0.5
                },
                timeout: 10000
            });

            const packages = response.data.objects
                .filter(obj => obj.package.name.startsWith(`${this.packageScope}/${this.modulePrefix}`))
                .map(obj => this.formatPackageInfo(obj.package));

            // Filter out prereleases if requested
            const filtered = options.includePrerelease 
                ? packages 
                : packages.filter(pkg => !semver.prerelease(pkg.version));

            // Cache the results
            this.cache.set(cacheKey, filtered);
            
            return filtered;
        } catch (error) {
            console.error('Error searching NPM registry:', error.message);
            // Return empty array on error to allow offline usage
            return [];
        }
    }

    /**
     * Extract integration name from package name
     * @private
     */
    extractIntegrationName(packageName) {
        return packageName
            .replace(`${this.packageScope}/${this.modulePrefix}`, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Format package information for API response
     * @private
     */
    formatPackageInfo(pkg) {
        return {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            keywords: pkg.keywords || [],
            author: pkg.author,
            publisher: pkg.publisher,
            date: pkg.date,
            links: pkg.links,
            integrationName: this.extractIntegrationName(pkg.name),
            category: this.categorizeModule(pkg)
        };
    }

    /**
     * Categorize module based on keywords and name
     * @private
     */
    categorizeModule(module) {
        const name = module.name?.toLowerCase() || '';
        const keywords = module.keywords?.map(k => k.toLowerCase()) || [];
        const allTerms = [...keywords, name];

        // Categories based on common integration types - ordered by specificity
        const categories = {
            'Marketing': ['marketing', 'mailchimp', 'campaign', 'automation', 'klaviyo', 'activecampaign'],
            'CRM': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive', 'zoho'],
            'E-commerce': ['ecommerce', 'shop', 'store', 'payment', 'stripe', 'paypal', 'shopify', 'woocommerce'],
            'Analytics': ['analytics', 'tracking', 'google-analytics', 'mixpanel', 'segment', 'amplitude'],
            'Social Media': ['social', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube'],
            'Project Management': ['project', 'task', 'jira', 'trello', 'asana', 'monday', 'notion'],
            'Storage': ['storage', 'file', 'dropbox', 'google-drive', 's3', 'box', 'onedrive'],
            'Productivity': ['spreadsheet', 'google-sheets', 'airtable', 'calendar', 'todo'],
            'Development': ['github', 'gitlab', 'bitbucket', 'git', 'ci', 'cd', 'jenkins'],
            'Support': ['support', 'zendesk', 'freshdesk', 'intercom', 'helpdesk'],
            'Finance': ['accounting', 'quickbooks', 'xero', 'sage', 'invoice', 'billing'],
            'Communication': ['email', 'sms', 'chat', 'messaging', 'slack', 'discord', 'twilio', 'sendgrid'],
            'Other': []
        };

        for (const [category, terms] of Object.entries(categories)) {
            if (category === 'Other') continue;
            
            if (terms.some(term => allTerms.some(t => t.includes(term)))) {
                return category;
            }
        }

        return 'Other';
    }

    /**
     * Get grouped modules by integration type
     * @returns {Promise<Object>} Modules grouped by type
     */
    async getModulesByType() {
        const modules = await this.searchApiModules();
        
        const grouped = modules.reduce((acc, module) => {
            const type = module.category;
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(module);
            return acc;
        }, {});

        return grouped;
    }
}

// Export singleton instance
module.exports = new NPMRegistryService();