// Service for discovering and fetching Frigg API modules from npm
export class APIModuleService {
  constructor() {
    this.npmRegistry = 'https://registry.npmjs.org';
    this.scope = '@friggframework';
    this.modulePrefix = 'api-module-';
    
    // Cache for module data
    this.moduleCache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour
  }

  // Fetch all available API modules from npm
  async getAllModules() {
    const cacheKey = 'all-modules';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Search for all @friggframework/api-module-* packages
      const searchUrl = `${this.npmRegistry}/-/v1/search?text=${encodeURIComponent(this.scope + '/' + this.modulePrefix)}&size=250`;
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch modules: ${response.status}`);
      }

      const data = await response.json();
      const modules = data.objects
        .filter(pkg => pkg.package.name.startsWith(`${this.scope}/${this.modulePrefix}`))
        .map(pkg => ({
          name: pkg.package.name,
          displayName: this.formatDisplayName(pkg.package.name),
          version: pkg.package.version,
          description: pkg.package.description,
          keywords: pkg.package.keywords || [],
          links: pkg.package.links || {},
          date: pkg.package.date,
          publisher: pkg.package.publisher,
          maintainers: pkg.package.maintainers || []
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      this.setCache(cacheKey, modules);
      return modules;
    } catch (error) {
      console.error('Error fetching API modules:', error);
      return [];
    }
  }

  // Get detailed information about a specific module
  async getModuleDetails(moduleName) {
    const cacheKey = `module-${moduleName}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const packageUrl = `${this.npmRegistry}/${moduleName}`;
      const response = await fetch(packageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch module details: ${response.status}`);
      }

      const data = await response.json();
      const latestVersion = data['dist-tags'].latest;
      const versionData = data.versions[latestVersion];

      const details = {
        name: data.name,
        displayName: this.formatDisplayName(data.name),
        version: latestVersion,
        description: data.description,
        readme: data.readme,
        homepage: data.homepage,
        repository: data.repository,
        keywords: versionData.keywords || [],
        dependencies: versionData.dependencies || {},
        peerDependencies: versionData.peerDependencies || {},
        maintainers: data.maintainers || [],
        time: data.time,
        // Extract configuration from package.json if available
        friggConfig: versionData.frigg || {},
        authType: this.detectAuthType(versionData),
        requiredFields: this.extractRequiredFields(versionData)
      };

      this.setCache(cacheKey, details);
      return details;
    } catch (error) {
      console.error(`Error fetching details for ${moduleName}:`, error);
      return null;
    }
  }

  // Format module name for display
  formatDisplayName(packageName) {
    const moduleName = packageName
      .replace(`${this.scope}/`, '')
      .replace(this.modulePrefix, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return moduleName;
  }

  // Detect authentication type from module
  detectAuthType(packageData) {
    const deps = { ...packageData.dependencies, ...packageData.peerDependencies };
    const keywords = packageData.keywords || [];
    const description = (packageData.description || '').toLowerCase();

    if (deps['@friggframework/oauth2'] || keywords.includes('oauth2')) {
      return 'oauth2';
    }
    if (deps['@friggframework/oauth1'] || keywords.includes('oauth1')) {
      return 'oauth1';
    }
    if (keywords.includes('api-key') || description.includes('api key')) {
      return 'api-key';
    }
    if (keywords.includes('basic-auth') || description.includes('basic auth')) {
      return 'basic-auth';
    }
    
    return 'custom';
  }

  // Extract required fields from module configuration
  extractRequiredFields(packageData) {
    const friggConfig = packageData.frigg || {};
    const fields = [];

    // Check for defined required fields in frigg config
    if (friggConfig.requiredFields) {
      return friggConfig.requiredFields;
    }

    // Otherwise, try to infer from common patterns
    const authType = this.detectAuthType(packageData);
    
    switch (authType) {
      case 'oauth2':
        fields.push(
          { name: 'client_id', label: 'Client ID', type: 'string', required: true },
          { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
          { name: 'redirect_uri', label: 'Redirect URI', type: 'string', required: true }
        );
        break;
      case 'api-key':
        fields.push(
          { name: 'api_key', label: 'API Key', type: 'password', required: true }
        );
        break;
      case 'basic-auth':
        fields.push(
          { name: 'username', label: 'Username', type: 'string', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true }
        );
        break;
    }

    return fields;
  }

  // Cache management
  getFromCache(key) {
    const cached = this.moduleCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.moduleCache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCache(key, data) {
    this.moduleCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.moduleCache.clear();
  }
}

// Export singleton instance
export default new APIModuleService();