import axios from 'axios';
import NodeCache from 'node-cache';
import semver from 'semver';

/**
 * NPM Registry Service
 * Handles fetching and caching of @friggframework/api-module-* packages
 */
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
            console.error('Error searching NPM registry:', error);
            throw new Error(`Failed to search NPM registry: ${error.message}`);
        }
    }

    /**
     * Get detailed information about a specific package
     * @param {string} packageName - Full package name (e.g., @friggframework/api-module-hubspot)
     * @param {string} version - Specific version or 'latest'
     * @returns {Promise<Object>} Detailed package information
     */
    async getPackageDetails(packageName, version = 'latest') {
        const cacheKey = `package-details-${packageName}-${version}`;
        
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `${this.npmRegistryUrl}/${packageName}`;
            const response = await axios.get(url, { timeout: 10000 });
            
            const data = response.data;
            const versionData = version === 'latest' 
                ? data.versions[data['dist-tags'].latest]
                : data.versions[version];

            if (!versionData) {
                throw new Error(`Version ${version} not found for package ${packageName}`);
            }

            const details = {
                name: data.name,
                version: versionData.version,
                description: versionData.description || data.description,
                keywords: versionData.keywords || data.keywords || [],
                homepage: versionData.homepage || data.homepage,
                repository: versionData.repository || data.repository,
                author: versionData.author || data.author,
                license: versionData.license || data.license,
                dependencies: versionData.dependencies || {},
                peerDependencies: versionData.peerDependencies || {},
                publishedAt: data.time[versionData.version],
                versions: Object.keys(data.versions).reverse(),
                distTags: data['dist-tags'],
                readme: data.readme,
                // Extract integration name from package name
                integrationName: this.extractIntegrationName(data.name),
                // Additional metadata
                isDeprecated: versionData.deprecated || false,
                engines: versionData.engines || {},
                maintainers: data.maintainers || []
            };

            // Cache the results
            this.cache.set(cacheKey, details);
            
            return details;
        } catch (error) {
            console.error(`Error fetching package details for ${packageName}:`, error);
            throw new Error(`Failed to fetch package details: ${error.message}`);
        }
    }

    /**
     * Get all available versions for a package
     * @param {string} packageName - Full package name
     * @returns {Promise<Array>} Array of version information
     */
    async getPackageVersions(packageName) {
        const cacheKey = `package-versions-${packageName}`;
        
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `${this.npmRegistryUrl}/${packageName}`;
            const response = await axios.get(url, { timeout: 10000 });
            
            const versions = Object.entries(response.data.versions)
                .map(([version, data]) => ({
                    version,
                    publishedAt: response.data.time[version],
                    deprecated: data.deprecated || false,
                    prerelease: !!semver.prerelease(version),
                    major: semver.major(version),
                    minor: semver.minor(version),
                    patch: semver.patch(version)
                }))
                .sort((a, b) => semver.rcompare(a.version, b.version));

            // Cache the results
            this.cache.set(cacheKey, versions);
            
            return versions;
        } catch (error) {
            console.error(`Error fetching versions for ${packageName}:`, error);
            throw new Error(`Failed to fetch package versions: ${error.message}`);
        }
    }

    /**
     * Check compatibility between a package version and Frigg core version
     * @param {string} packageName - Package name to check
     * @param {string} packageVersion - Package version
     * @param {string} friggVersion - Frigg core version
     * @returns {Promise<Object>} Compatibility information
     */
    async checkCompatibility(packageName, packageVersion, friggVersion) {
        try {
            const details = await this.getPackageDetails(packageName, packageVersion);
            
            const compatibility = {
                compatible: true,
                warnings: [],
                errors: [],
                recommendations: []
            };

            // Check peer dependencies
            if (details.peerDependencies['@friggframework/core']) {
                const requiredVersion = details.peerDependencies['@friggframework/core'];
                if (!semver.satisfies(friggVersion, requiredVersion)) {
                    compatibility.compatible = false;
                    compatibility.errors.push(
                        `Package requires @friggframework/core ${requiredVersion}, but current version is ${friggVersion}`
                    );
                }
            }

            // Check engine requirements
            if (details.engines?.node) {
                const nodeVersion = process.version;
                if (!semver.satisfies(nodeVersion, details.engines.node)) {
                    compatibility.warnings.push(
                        `Package requires Node.js ${details.engines.node}, current version is ${nodeVersion}`
                    );
                }
            }

            // Check for deprecated versions
            if (details.isDeprecated) {
                compatibility.warnings.push('This version is deprecated');
                compatibility.recommendations.push('Consider upgrading to the latest version');
            }

            // Check if it's a prerelease version
            if (semver.prerelease(packageVersion)) {
                compatibility.warnings.push('This is a prerelease version and may be unstable');
            }

            return compatibility;
        } catch (error) {
            console.error('Error checking compatibility:', error);
            throw new Error(`Failed to check compatibility: ${error.message}`);
        }
    }

    /**
     * Get grouped modules by integration type
     * @returns {Promise<Object>} Modules grouped by type
     */
    async getModulesByType() {
        const modules = await this.searchApiModules();
        
        const grouped = modules.reduce((acc, module) => {
            const type = this.categorizeModule(module);
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(module);
            return acc;
        }, {});

        return grouped;
    }

    /**
     * Clear the cache
     * @param {string} pattern - Optional pattern to match cache keys
     */
    clearCache(pattern = null) {
        if (pattern) {
            const keys = this.cache.keys();
            keys.forEach(key => {
                if (key.includes(pattern)) {
                    this.cache.del(key);
                }
            });
        } else {
            this.cache.flushAll();
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            keys: this.cache.keys().length,
            hits: this.cache.getStats().hits,
            misses: this.cache.getStats().misses,
            ksize: this.cache.getStats().ksize,
            vsize: this.cache.getStats().vsize
        };
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
     * Categorize module based on keywords and name
     * @private
     */
    categorizeModule(module) {
        const name = module.name?.toLowerCase() || '';
        const keywords = module.keywords?.map(k => k.toLowerCase()) || [];
        const allTerms = [...keywords, name];

        // Categories based on common integration types
        const categories = {
            'CRM': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive'],
            'Communication': ['email', 'sms', 'chat', 'messaging', 'slack', 'discord', 'twilio'],
            'E-commerce': ['ecommerce', 'shop', 'store', 'payment', 'stripe', 'paypal', 'shopify'],
            'Analytics': ['analytics', 'tracking', 'google-analytics', 'mixpanel', 'segment'],
            'Marketing': ['marketing', 'mailchimp', 'sendgrid', 'campaign', 'automation'],
            'Social Media': ['social', 'facebook', 'twitter', 'instagram', 'linkedin'],
            'Project Management': ['project', 'task', 'jira', 'trello', 'asana', 'monday'],
            'Storage': ['storage', 'file', 'dropbox', 'google-drive', 's3', 'box'],
            'Development': ['github', 'gitlab', 'bitbucket', 'git', 'ci', 'cd'],
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
}

// Export singleton instance
export default new NPMRegistryService();