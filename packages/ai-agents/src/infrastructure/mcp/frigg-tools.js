const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

const execAsync = promisify(exec);

const INTEGRATION_CATEGORIES = [
    'CRM', 'Marketing', 'Communication', 'ECommerce',
    'Finance', 'Analytics', 'Storage', 'Development',
    'Productivity', 'Social', 'Other'
];

const INTEGRATION_TYPES = ['api', 'webhook', 'sync', 'transform', 'custom'];

const CATEGORY_TEMPLATES = {
    CRM: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            ${name.toLowerCase()}: { definition: require('@friggframework/api-module-${name.toLowerCase()}') }
        },
        options: {
            type: 'api',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} CRM integration for contacts, deals, and company management',
                category: 'CRM',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['oauth2'],
            webhooks: ${options.webhooks || false},
            sync: { bidirectional: true, incremental: true }
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
        ${options.webhooks ? `// Register webhooks for real-time updates
        // await this.registerWebhooks();` : ''}
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {
        ${options.webhooks ? `// Cleanup webhooks
        // await this.unregisterWebhooks();` : ''}
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    syncContacts: { type: 'boolean', title: 'Sync Contacts', default: true },
                    syncDeals: { type: 'boolean', title: 'Sync Deals', default: true },
                    syncCompanies: { type: 'boolean', title: 'Sync Companies', default: true }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const module = this.getModule('${name.toLowerCase()}');
        return module.testAuth();
    }
${options.webhooks ? `
    async onWebhookReceived({ req, res }) {
        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers
        });
        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        const { body } = data;
        // Process CRM webhook events (contact.created, deal.updated, etc.)
    }
` : ''}}

module.exports = { ${capitalize(name)}Integration };
`,

    Finance: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            ${name.toLowerCase()}: { definition: require('@friggframework/api-module-${name.toLowerCase()}') }
        },
        options: {
            type: 'api',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} finance integration for invoices, payments, and accounting',
                category: 'Finance',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['${options.authType || 'oauth2'}'],
            webhooks: ${options.webhooks || false},
            sync: { bidirectional: false, incremental: true }
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {}

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    syncInvoices: { type: 'boolean', title: 'Sync Invoices', default: true },
                    syncPayments: { type: 'boolean', title: 'Sync Payments', default: true },
                    syncCustomers: { type: 'boolean', title: 'Sync Customers', default: true }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const module = this.getModule('${name.toLowerCase()}');
        return module.testAuth();
    }
}

module.exports = { ${capitalize(name)}Integration };
`,

    Communication: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            ${name.toLowerCase()}: { definition: require('@friggframework/api-module-${name.toLowerCase()}') }
        },
        options: {
            type: 'api',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} communication integration for messaging and notifications',
                category: 'Communication',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['oauth2'],
            webhooks: true,
            realtime: true
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
        // Subscribe to message events
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {
        // Unsubscribe from events
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    defaultChannel: { type: 'string', title: 'Default Channel' },
                    notifyOnMention: { type: 'boolean', title: 'Notify on Mention', default: true }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const module = this.getModule('${name.toLowerCase()}');
        return module.testAuth();
    }

    async onWebhookReceived({ req, res }) {
        // Handle Slack/Teams challenge verification
        if (req.body.challenge) {
            return res.status(200).json({ challenge: req.body.challenge });
        }

        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers
        });
        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        const { body } = data;
        // Process message events
    }
}

module.exports = { ${capitalize(name)}Integration };
`,

    ECommerce: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            ${name.toLowerCase()}: { definition: require('@friggframework/api-module-${name.toLowerCase()}') }
        },
        options: {
            type: 'api',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} e-commerce integration for orders, products, and customers',
                category: 'ECommerce',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['oauth2'],
            webhooks: true,
            sync: { bidirectional: true, incremental: true, batchSize: 250 }
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
        // Register order and inventory webhooks
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {
        // Cleanup webhooks
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    syncOrders: { type: 'boolean', title: 'Sync Orders', default: true },
                    syncProducts: { type: 'boolean', title: 'Sync Products', default: true },
                    syncCustomers: { type: 'boolean', title: 'Sync Customers', default: true },
                    syncInventory: { type: 'boolean', title: 'Sync Inventory', default: false }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const module = this.getModule('${name.toLowerCase()}');
        return module.testAuth();
    }

    async onWebhookReceived({ req, res }) {
        // Verify webhook signature
        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers
        });
        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        const { body } = data;
        // Process order/product/inventory events
    }
}

module.exports = { ${capitalize(name)}Integration };
`,

    Storage: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            ${name.toLowerCase()}: { definition: require('@friggframework/api-module-${name.toLowerCase()}') }
        },
        options: {
            type: 'api',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} storage integration for files and documents',
                category: 'Storage',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['oauth2'],
            webhooks: ${options.webhooks || false}
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {}

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    rootFolder: { type: 'string', title: 'Root Folder Path' },
                    syncSubfolders: { type: 'boolean', title: 'Sync Subfolders', default: true }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const module = this.getModule('${name.toLowerCase()}');
        return module.testAuth();
    }
}

module.exports = { ${capitalize(name)}Integration };
`,

    Webhook: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');
const crypto = require('crypto');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {},
        options: {
            type: 'webhook',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} webhook-only integration for receiving external events',
                category: '${options.category || 'Other'}',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['custom'],
            webhooks: true
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async onUpdate(params) {}

    async onDelete(params) {}

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                required: ['webhookSecret'],
                properties: {
                    webhookSecret: {
                        type: 'string',
                        title: 'Webhook Secret',
                        description: 'Secret for validating webhook signatures'
                    }
                }
            },
            uiSchema: {
                webhookSecret: { 'ui:widget': 'password' }
            }
        };
    }

    async testAuth() {
        return true;
    }

    verifySignature(body, signature, secret) {
        const expected = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(body))
            .digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signature || ''),
            Buffer.from(expected)
        );
    }

    async onWebhookReceived({ req, res }) {
        const signature = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'];
        const config = this.getConfig();

        if (config.webhookSecret && !this.verifySignature(req.body, signature, config.webhookSecret)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers
        });
        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        const { body } = data;
        // Process webhook event
    }
}

module.exports = { ${capitalize(name)}Integration };
`,

    Sync: (name, options = {}) => `const { IntegrationBase } = require('@friggframework/core');

class ${capitalize(name)}Integration extends IntegrationBase {
    static Definition = {
        name: '${name.toLowerCase()}',
        version: '1.0.0',
        modules: {
            source: { definition: require('@friggframework/api-module-${options.sourceModule || name.toLowerCase()}') },
            target: { definition: require('@friggframework/api-module-${options.targetModule || name.toLowerCase()}') }
        },
        options: {
            type: 'sync',
            hasUserConfig: true,
            display: {
                name: '${capitalize(name)}',
                description: '${capitalize(name)} sync integration for bidirectional data synchronization',
                category: '${options.category || 'Other'}',
                icon: '${name.toLowerCase()}'
            }
        },
        capabilities: {
            auth: ['oauth2'],
            webhooks: true,
            sync: { bidirectional: true, incremental: true, batchSize: 100 }
        }
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
        // Initialize sync state
    }

    async onUpdate(params) {
        await this.validateConfig();
    }

    async onDelete(params) {
        // Cleanup sync state
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    syncDirection: {
                        type: 'string',
                        title: 'Sync Direction',
                        enum: ['source-to-target', 'target-to-source', 'bidirectional'],
                        default: 'bidirectional'
                    },
                    conflictResolution: {
                        type: 'string',
                        title: 'Conflict Resolution',
                        enum: ['source-wins', 'target-wins', 'newest-wins'],
                        default: 'newest-wins'
                    },
                    syncInterval: {
                        type: 'integer',
                        title: 'Sync Interval (minutes)',
                        default: 15,
                        minimum: 5
                    }
                }
            },
            uiSchema: {}
        };
    }

    async testAuth() {
        const sourceModule = this.getModule('source');
        const targetModule = this.getModule('target');
        await sourceModule.testAuth();
        await targetModule.testAuth();
        return true;
    }
}

module.exports = { ${capitalize(name)}Integration };
`
};

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

class NPMRegistryService {
    constructor() {
        this.searchUrl = 'https://registry.npmjs.org/-/v1/search';
        this.packageScope = '@friggframework';
        this.modulePrefix = 'api-module-';
    }

    async searchApiModules(options = {}) {
        const { category, limit = 250 } = options;
        const searchQuery = `${this.packageScope}/${this.modulePrefix}`;

        try {
            const response = await axios.get(this.searchUrl, {
                params: {
                    text: searchQuery,
                    size: limit,
                    quality: 0.65,
                    popularity: 0.98,
                    maintenance: 0.5
                },
                timeout: 10000
            });

            let modules = response.data.objects
                .filter(obj => obj.package.name.startsWith(`${this.packageScope}/${this.modulePrefix}`))
                .map(obj => this.formatPackageInfo(obj.package));

            if (category && category !== 'all') {
                modules = modules.filter(m => m.category === category);
            }

            return modules;
        } catch (error) {
            return [];
        }
    }

    formatPackageInfo(pkg) {
        const name = pkg.name.replace(`${this.packageScope}/${this.modulePrefix}`, '');
        return {
            name,
            fullName: pkg.name,
            displayName: this.formatDisplayName(name),
            version: pkg.version,
            description: pkg.description || '',
            category: this.categorizeModule(name, pkg.description || ''),
            authType: this.inferAuthType(name, pkg.description || '')
        };
    }

    formatDisplayName(name) {
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    categorizeModule(name, description) {
        const text = `${name} ${description}`.toLowerCase();
        const categories = {
            'CRM': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive', 'zoho', 'attio', 'copper'],
            'Finance': ['accounting', 'quickbooks', 'xero', 'sage', 'invoice', 'billing', 'stripe', 'payment'],
            'Communication': ['email', 'sms', 'chat', 'messaging', 'slack', 'discord', 'twilio', 'teams', 'intercom'],
            'ECommerce': ['shop', 'commerce', 'shopify', 'woocommerce', 'magento', 'bigcommerce', 'store'],
            'Marketing': ['marketing', 'campaign', 'mailchimp', 'sendgrid', 'marketo', 'constantcontact'],
            'Analytics': ['analytics', 'tracking', 'mixpanel', 'segment', 'amplitude', 'google-analytics'],
            'Storage': ['storage', 'drive', 'dropbox', 'box', 'onedrive', 'file', 'document'],
            'Development': ['github', 'gitlab', 'bitbucket', 'jira', 'linear', 'notion', 'confluence'],
            'Productivity': ['asana', 'monday', 'trello', 'clickup', 'basecamp', 'todoist', 'airtable'],
            'Social': ['social', 'twitter', 'facebook', 'linkedin', 'instagram', 'youtube']
        };

        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }
        return 'Other';
    }

    inferAuthType(name, description) {
        const text = `${name} ${description}`.toLowerCase();
        if (text.includes('api key') || text.includes('apikey')) {
            return 'api-key';
        }
        return 'oauth2';
    }
}

let gitCheckpointServiceInstance = null;

function setGitCheckpointService(service) {
    gitCheckpointServiceInstance = service;
}

async function validateSchemaHandler({ schemaType, content }) {
    let parsed;
    try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
        return { valid: false, errors: [`Invalid JSON: ${e.message}`] };
    }

    const errors = [];
    const warnings = [];

    if (schemaType === 'integration-definition') {
        if (!parsed.name) {
            errors.push('name is required');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(parsed.name)) {
            errors.push('name must match pattern ^[a-zA-Z][a-zA-Z0-9_-]*$');
        }

        if (!parsed.version) {
            errors.push('version is required');
        } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(parsed.version)) {
            errors.push('version must follow semantic versioning (X.Y.Z or X.Y.Z-prerelease)');
        }

        if (parsed.options?.type && !INTEGRATION_TYPES.includes(parsed.options.type)) {
            errors.push(`options.type must be one of: ${INTEGRATION_TYPES.join(', ')}`);
        }

        if (parsed.options?.display?.category && !INTEGRATION_CATEGORIES.includes(parsed.options.display.category)) {
            errors.push(`options.display.category must be one of: ${INTEGRATION_CATEGORIES.join(', ')}`);
        }

        if (parsed.capabilities?.auth) {
            const validAuth = ['oauth2', 'api-key', 'basic', 'token', 'custom'];
            for (const auth of parsed.capabilities.auth) {
                if (!validAuth.includes(auth)) {
                    errors.push(`capabilities.auth contains invalid value: ${auth}`);
                }
            }
        }

        if (parsed.model?.status) {
            const validStatus = ['active', 'inactive', 'error', 'pending', 'disabled'];
            if (!validStatus.includes(parsed.model.status)) {
                errors.push(`model.status must be one of: ${validStatus.join(', ')}`);
            }
        }

        if (!parsed.modules || Object.keys(parsed.modules).length === 0) {
            warnings.push('No modules defined - integration may not connect to external services');
        }

        if (!parsed.options?.display?.name) {
            warnings.push('Missing display.name - UI will use internal name');
        }
    }

    if (schemaType === 'api-module-definition') {
        if (!parsed.name && !parsed.moduleName) {
            errors.push('name or moduleName is required');
        }

        if (!parsed.authType && !parsed.requester?.baseUrl) {
            warnings.push('No authType or baseUrl specified');
        }
    }

    if (schemaType === 'app-definition') {
        if (!parsed.name) {
            errors.push('name is required');
        }

        if (!parsed.integrations || parsed.integrations.length === 0) {
            warnings.push('No integrations defined in app');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

async function getTemplateHandler({ category, integrationName, options = {} }) {
    const templateFn = CATEGORY_TEMPLATES[category];

    if (!templateFn) {
        const availableCategories = Object.keys(CATEGORY_TEMPLATES);
        return {
            error: `Unknown category: ${category}. Available: ${availableCategories.join(', ')}`,
            availableCategories
        };
    }

    const template = templateFn(integrationName || 'MyIntegration', options);
    return {
        template: template.trim(),
        category,
        integrationName: integrationName || 'MyIntegration',
        suggestedFilename: `${(integrationName || 'my-integration').toLowerCase()}-integration.js`
    };
}

async function checkPatternsHandler({ code, fileType }) {
    const violations = [];
    const suggestions = [];

    if (fileType === 'integration') {
        if (!code.includes('extends IntegrationBase')) {
            violations.push({
                rule: 'extends-integration-base',
                severity: 'error',
                message: 'Integration must extend IntegrationBase',
                suggestion: 'class YourIntegration extends IntegrationBase { ... }'
            });
        }

        if (!code.includes('static Definition')) {
            violations.push({
                rule: 'static-definition',
                severity: 'error',
                message: 'Integration must have static Definition property',
                suggestion: 'Add: static Definition = { name, version, modules, options, capabilities }'
            });
        } else {
            if (!code.includes("name:") && !code.includes('name :')) {
                violations.push({
                    rule: 'definition-name',
                    severity: 'error',
                    message: 'Definition must include name property'
                });
            }
            if (!code.includes("version:") && !code.includes('version :')) {
                violations.push({
                    rule: 'definition-version',
                    severity: 'error',
                    message: 'Definition must include version property'
                });
            }
        }

        const lifecycleMethods = ['onCreate', 'onUpdate', 'onDelete', 'getConfigOptions', 'testAuth'];
        const missingMethods = lifecycleMethods.filter(m => !code.includes(`async ${m}(`));

        if (missingMethods.length > 0) {
            violations.push({
                rule: 'lifecycle-methods',
                severity: 'warning',
                message: `Missing lifecycle methods: ${missingMethods.join(', ')}`,
                suggestion: `Consider implementing: ${missingMethods.map(m => `async ${m}() { }`).join(', ')}`
            });
        }

        if (code.includes('webhooks: true') || code.includes("type: 'webhook'")) {
            if (!code.includes('onWebhookReceived') || !code.includes('onWebhook')) {
                violations.push({
                    rule: 'webhook-handlers',
                    severity: 'warning',
                    message: 'Webhooks enabled but handlers not implemented',
                    suggestion: 'Implement onWebhookReceived() and onWebhook() methods'
                });
            }
        }

        if (!code.includes('updateIntegrationStatus')) {
            suggestions.push({
                rule: 'status-updates',
                message: 'Consider calling updateIntegrationStatus in onCreate',
                suggestion: "await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');"
            });
        }
    }

    if (fileType === 'api-module') {
        if (!code.includes('class') || (!code.includes('extends') && !code.includes('Api'))) {
            violations.push({
                rule: 'api-class',
                severity: 'warning',
                message: 'API module should define a class (typically extending a base Api class)'
            });
        }

        if (!code.includes('testAuth')) {
            violations.push({
                rule: 'test-auth',
                severity: 'warning',
                message: 'API module should implement testAuth() method'
            });
        }
    }

    return {
        compliant: violations.filter(v => v.severity === 'error').length === 0,
        violations,
        suggestions: suggestions.length > 0 ? suggestions : undefined
    };
}

async function listModulesHandler({ category }) {
    const npmService = new NPMRegistryService();

    try {
        const modules = await npmService.searchApiModules({ category });
        return {
            modules,
            total: modules.length,
            source: 'npm-registry'
        };
    } catch (error) {
        return {
            modules: [],
            total: 0,
            error: error.message,
            source: 'npm-registry'
        };
    }
}

async function runTestsHandler({ testPattern, coverage = false, watch = false }) {
    const args = ['jest'];

    if (testPattern) {
        args.push(testPattern);
    }

    if (coverage) {
        args.push('--coverage');
    }

    if (watch) {
        args.push('--watch');
    }

    args.push('--passWithNoTests');

    return new Promise((resolve) => {
        const jestProcess = spawn('npx', args, {
            cwd: process.cwd(),
            env: { ...process.env, FORCE_COLOR: '0' }
        });

        let stdout = '';
        let stderr = '';

        jestProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        jestProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        jestProcess.on('close', (code) => {
            const lines = (stdout + stderr).split('\n');
            const summaryLine = lines.find(l => l.includes('Tests:') || l.includes('Test Suites:'));
            const coverageLine = lines.find(l => l.includes('Coverage'));

            let passed = 0;
            let failed = 0;
            let total = 0;

            const testMatch = (stdout + stderr).match(/Tests:\s+(\d+)\s+passed/);
            const failMatch = (stdout + stderr).match(/(\d+)\s+failed/);
            const totalMatch = (stdout + stderr).match(/(\d+)\s+total/);

            if (testMatch) passed = parseInt(testMatch[1]);
            if (failMatch) failed = parseInt(failMatch[1]);
            if (totalMatch) total = parseInt(totalMatch[1]);

            resolve({
                passed,
                failed,
                total,
                exitCode: code,
                success: code === 0,
                summary: summaryLine || 'Tests completed',
                coverage: coverageLine || (coverage ? 'Coverage data in ./coverage' : undefined),
                output: stdout.substring(0, 5000)
            });
        });

        jestProcess.on('error', (error) => {
            resolve({
                passed: 0,
                failed: 0,
                total: 0,
                exitCode: 1,
                success: false,
                error: error.message
            });
        });
    });
}

async function securityScanHandler({ code, scanType = 'full' }) {
    const vulnerabilities = [];

    if (scanType === 'full' || scanType === 'credentials') {
        const credentialPatterns = [
            { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'API key' },
            { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'Password' },
            { pattern: /secret\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'Secret' },
            { pattern: /token\s*[:=]\s*['"][^'"]{20,}['"]/gi, type: 'Token' },
            { pattern: /bearer\s+[a-zA-Z0-9._-]{20,}/gi, type: 'Bearer token' },
            { pattern: /aws[_-]?(access[_-]?key|secret)[_-]?id?\s*[:=]\s*['"][^'"]+['"]/gi, type: 'AWS credentials' }
        ];

        for (const { pattern, type } of credentialPatterns) {
            if (pattern.test(code)) {
                vulnerabilities.push({
                    type: 'hardcoded-credential',
                    credentialType: type,
                    severity: 'high',
                    description: `Possible hardcoded ${type} detected`,
                    fix: 'Use environment variables: process.env.YOUR_SECRET_NAME'
                });
            }
        }
    }

    if (scanType === 'full' || scanType === 'injection') {
        if (/eval\s*\(/.test(code)) {
            vulnerabilities.push({
                type: 'code-injection',
                severity: 'critical',
                description: 'Use of eval() detected - potential code injection vulnerability',
                fix: 'Avoid eval(). Use JSON.parse() for JSON, or safer alternatives'
            });
        }

        if (/new\s+Function\s*\(/.test(code) && code.includes('req.')) {
            vulnerabilities.push({
                type: 'code-injection',
                severity: 'high',
                description: 'Dynamic Function constructor with user input detected',
                fix: 'Avoid constructing functions from user input'
            });
        }

        if (/\$\{.*req\.(body|query|params)/.test(code) && /exec|spawn/.test(code)) {
            vulnerabilities.push({
                type: 'command-injection',
                severity: 'critical',
                description: 'Potential command injection - user input in shell command',
                fix: 'Sanitize input and use parameterized commands'
            });
        }
    }

    if (scanType === 'full' || scanType === 'validation') {
        if (code.includes('req.body') && !code.includes('validate') && !code.includes('schema') && !code.includes('joi') && !code.includes('zod')) {
            vulnerabilities.push({
                type: 'missing-validation',
                severity: 'medium',
                description: 'Request body used without apparent validation',
                fix: 'Add input validation using a schema library (Joi, Zod, AJV)'
            });
        }

        if (/onWebhookReceived|onWebhook/.test(code) && !code.includes('signature') && !code.includes('verify') && !code.includes('hmac')) {
            vulnerabilities.push({
                type: 'missing-webhook-validation',
                severity: 'medium',
                description: 'Webhook handler without signature verification',
                fix: 'Implement HMAC signature verification for webhook security'
            });
        }
    }

    return {
        vulnerabilities,
        scanned: true,
        scanType,
        summary: vulnerabilities.length === 0
            ? 'No vulnerabilities detected'
            : `Found ${vulnerabilities.length} potential issue(s)`
    };
}

async function gitCheckpointHandler({ message }) {
    if (gitCheckpointServiceInstance) {
        try {
            const checkpoint = await gitCheckpointServiceInstance.createCheckpoint(message);
            return {
                checkpointId: checkpoint.id,
                hash: checkpoint.hash,
                message: checkpoint.message,
                timestamp: checkpoint.timestamp,
                hasPendingChanges: checkpoint.hasPendingChanges,
                rollbackCommand: `git reset --mixed ${checkpoint.hash}`
            };
        } catch (error) {
            return {
                error: error.message,
                fallback: true
            };
        }
    }

    try {
        const { stdout: hash } = await execAsync('git rev-parse HEAD');
        const { stdout: status } = await execAsync('git status --porcelain');

        const checkpointId = `checkpoint-${Date.now()}-${hash.trim().substring(0, 8)}`;

        return {
            checkpointId,
            hash: hash.trim(),
            message,
            timestamp: new Date().toISOString(),
            hasPendingChanges: status.trim().length > 0,
            rollbackCommand: `git reset --mixed ${hash.trim()}`
        };
    } catch (error) {
        return {
            error: `Git error: ${error.message}`,
            suggestion: 'Ensure you are in a git repository'
        };
    }
}

async function getExampleHandler({ pattern }) {
    const examples = {
        'crm-integration': {
            description: 'Complete CRM integration with contacts and deals sync',
            code: CATEGORY_TEMPLATES.CRM('hubspot', { webhooks: true }),
            relatedFiles: [
                'packages/core/integrations/integration-base.js',
                'api-module-library/packages/hubspot/*'
            ]
        },
        'webhook-handler': {
            description: 'Secure webhook handler with signature verification',
            code: `async onWebhookReceived({ req, res }) {
    const signature = req.headers['x-webhook-signature'];
    const secret = this.getConfig().webhookSecret;

    if (!this.verifySignature(req.body, signature, secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    await this.queueWebhook({
        integrationId: req.params.integrationId,
        body: req.body,
        headers: req.headers
    });

    res.status(200).json({ received: true });
}

verifySignature(body, signature, secret) {
    const crypto = require('crypto');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature || '', 'utf8'),
        Buffer.from(expected, 'utf8')
    );
}

async onWebhook({ data }) {
    const { body, headers } = data;
    const eventType = headers['x-event-type'] || body.event;

    switch (eventType) {
        case 'contact.created':
            await this.handleContactCreated(body.data);
            break;
        case 'deal.updated':
            await this.handleDealUpdated(body.data);
            break;
        default:
            console.log('Unhandled event:', eventType);
    }
}`
        },
        'form-config': {
            description: 'Dynamic form configuration with JSON Schema',
            code: `async getConfigOptions() {
    const module = this.getModule('myModule');
    const availableWorkspaces = await module.listWorkspaces();

    return {
        jsonSchema: {
            type: 'object',
            required: ['workspace', 'syncDirection'],
            properties: {
                workspace: {
                    type: 'string',
                    title: 'Workspace',
                    enum: availableWorkspaces.map(w => w.id),
                    enumNames: availableWorkspaces.map(w => w.name)
                },
                syncDirection: {
                    type: 'string',
                    title: 'Sync Direction',
                    enum: ['push', 'pull', 'bidirectional'],
                    default: 'bidirectional'
                },
                syncInterval: {
                    type: 'integer',
                    title: 'Sync Interval (minutes)',
                    minimum: 5,
                    maximum: 1440,
                    default: 60
                },
                enableNotifications: {
                    type: 'boolean',
                    title: 'Enable Notifications',
                    default: true
                }
            }
        },
        uiSchema: {
            workspace: {
                'ui:placeholder': 'Select a workspace...'
            },
            syncInterval: {
                'ui:widget': 'range'
            }
        }
    };
}

async refreshConfigOptions({ configKey, currentConfig }) {
    if (configKey === 'workspace') {
        const module = this.getModule('myModule');
        const workspaces = await module.listWorkspaces();
        return {
            options: workspaces.map(w => ({ value: w.id, label: w.name }))
        };
    }
    return null;
}`
        },
        'oauth2-flow': {
            description: 'OAuth2 authentication flow implementation',
            code: `// In your API module (not integration)
class MyServiceApi extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://api.myservice.com';

        this.URLs = {
            authorization: 'https://myservice.com/oauth/authorize',
            token: 'https://myservice.com/oauth/token',
            userInfo: '/api/v1/me'
        };
    }

    getAuthorizationUri() {
        return this.authorizationUri({
            client_id: this.client_id,
            redirect_uri: this.redirect_uri,
            scope: 'read write',
            response_type: 'code'
        });
    }

    async getAccessToken(code) {
        return this._getAccessToken({
            code,
            grant_type: 'authorization_code',
            client_id: this.client_id,
            client_secret: this.client_secret,
            redirect_uri: this.redirect_uri
        });
    }

    async refreshAccessToken() {
        return this._refreshAccessToken({
            grant_type: 'refresh_token',
            refresh_token: this.refresh_token,
            client_id: this.client_id,
            client_secret: this.client_secret
        });
    }

    async testAuth() {
        const response = await this._get(this.URLs.userInfo);
        return { success: true, user: response };
    }
}`
        },
        'sync-pattern': {
            description: 'Bidirectional data sync pattern',
            code: CATEGORY_TEMPLATES.Sync('DataSync', { category: 'Productivity' })
        },
        'api-module-complete': {
            description: 'Complete API module structure',
            code: `const { OAuth2Requester } = require('@friggframework/module-plugin');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');

class MyServiceApi extends OAuth2Requester {
    static Config = {
        name: 'MyService',
        authType: 'oauth2',
        hasTestAuth: true
    };

    constructor(params) {
        super(params);
        this.baseUrl = process.env.MYSERVICE_API_URL || 'https://api.myservice.com';
        this.tokenUri = 'https://myservice.com/oauth/token';
        this.authorizationUri = 'https://myservice.com/oauth/authorize';
    }

    // Auth methods
    getAuthorizationUri() { /* ... */ }
    async getAccessToken(code) { /* ... */ }
    async testAuth() {
        const user = await this._get('/api/v1/me');
        return { success: true, user };
    }

    // Resource methods
    async listContacts(params = {}) {
        return this._get('/api/v1/contacts', { params });
    }

    async getContact(id) {
        return this._get(\`/api/v1/contacts/\${id}\`);
    }

    async createContact(data) {
        return this._post('/api/v1/contacts', data);
    }

    async updateContact(id, data) {
        return this._patch(\`/api/v1/contacts/\${id}\`, data);
    }

    async deleteContact(id) {
        return this._delete(\`/api/v1/contacts/\${id}\`);
    }

    // Webhook methods
    async registerWebhook(config) {
        return this._post('/api/v1/webhooks', config);
    }

    async deleteWebhook(id) {
        return this._delete(\`/api/v1/webhooks/\${id}\`);
    }
}

const Definition = {
    moduleName: 'myservice',
    Api: MyServiceApi,
    Credential,
    Entity
};

module.exports = { MyServiceApi, Definition };`
        }
    };

    const example = examples[pattern];

    if (!example) {
        return {
            error: `Unknown pattern: ${pattern}`,
            availablePatterns: Object.keys(examples).map(key => ({
                name: key,
                description: examples[key].description
            }))
        };
    }

    return {
        pattern,
        description: example.description,
        code: example.code.trim(),
        relatedFiles: example.relatedFiles
    };
}

const DOCS_INDEX = {
    'integration-base': {
        title: 'IntegrationBase Class',
        path: 'packages/core/integrations/integration-base.js',
        topics: ['integration', 'lifecycle', 'modules', 'events', 'webhooks'],
        summary: 'Base class all integrations must extend. Provides lifecycle methods (onCreate, onUpdate, onDelete), module management, webhook handling, and status updates.'
    },
    'api-module': {
        title: 'API Module Development',
        path: 'docs/api-module-library/overview.md',
        topics: ['api-module', 'oauth2', 'api-key', 'requester'],
        summary: 'Guide to building API modules that connect to external services. Covers authentication types, requester patterns, and module structure.'
    },
    'forms-config': {
        title: 'Form Configuration (JSON Schema)',
        path: 'packages/core/integrations/options.js',
        topics: ['forms', 'json-schema', 'ui-schema', 'config-options'],
        summary: 'Dynamic form configuration using JSON Schema. Used in getConfigOptions() to define user-configurable settings.'
    },
    'webhooks': {
        title: 'Webhook Handling',
        path: 'packages/core/integrations/integration-base.js',
        topics: ['webhooks', 'signature', 'queue', 'events'],
        summary: 'Webhook implementation patterns including signature verification, event queuing, and processing. Methods: onWebhookReceived, onWebhook, queueWebhook.'
    },
    'encryption': {
        title: 'Field-Level Encryption',
        path: 'packages/core/database/encryption/README.md',
        topics: ['encryption', 'kms', 'aes', 'credentials', 'security'],
        summary: 'Transparent field-level encryption for sensitive data. Supports AWS KMS and AES. Automatically encrypts credentials, tokens, and mapping data.'
    },
    'repositories': {
        title: 'Repository Pattern',
        path: 'packages/core/integrations/repositories/',
        topics: ['repository', 'database', 'crud', 'prisma', 'mongo'],
        summary: 'Data access layer following repository pattern. Supports MongoDB, PostgreSQL via Prisma, and DocumentDB. Handles integration and mapping persistence.'
    },
    'use-cases': {
        title: 'Use Case Pattern',
        path: 'packages/core/integrations/use-cases/',
        topics: ['use-case', 'business-logic', 'orchestration'],
        summary: 'Business logic orchestration following hexagonal architecture. Use cases coordinate repositories and domain operations.'
    },
    'cli': {
        title: 'Frigg CLI',
        path: 'packages/devtools/frigg-cli/',
        topics: ['cli', 'install', 'deploy', 'start', 'validate'],
        summary: 'Command-line interface for Frigg development. Commands: install, search, start, deploy, validate. Manages API modules and infrastructure.'
    },
    'infrastructure': {
        title: 'Infrastructure as Code',
        path: 'packages/devtools/infrastructure/',
        topics: ['serverless', 'aws', 'lambda', 'vpc', 'deployment'],
        summary: 'AWS infrastructure generation and deployment. Creates serverless.yml, discovers VPC/KMS resources, manages IAM policies.'
    },
    'testing': {
        title: 'Testing Patterns',
        path: 'packages/core/integrations/test/',
        topics: ['testing', 'jest', 'mock', 'integration-test'],
        summary: 'Testing strategies for Frigg integrations. Includes mock API utilities, test doubles, and integration test patterns.'
    }
};

async function searchDocsHandler({ query, topic, limit = 5 }) {
    const results = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const [key, doc] of Object.entries(DOCS_INDEX)) {
        let score = 0;

        if (topic && doc.topics.includes(topic.toLowerCase())) {
            score += 50;
        }

        for (const word of queryWords) {
            if (doc.title.toLowerCase().includes(word)) {
                score += 30;
            }
            if (doc.summary.toLowerCase().includes(word)) {
                score += 20;
            }
            if (doc.topics.some(t => t.includes(word))) {
                score += 25;
            }
            if (key.includes(word)) {
                score += 15;
            }
        }

        if (score > 0) {
            results.push({
                key,
                ...doc,
                score
            });
        }
    }

    results.sort((a, b) => b.score - a.score);

    return {
        query,
        topic,
        results: results.slice(0, limit).map(r => ({
            title: r.title,
            path: r.path,
            summary: r.summary,
            topics: r.topics,
            relevance: Math.min(100, r.score)
        })),
        totalMatches: results.length
    };
}

async function readDocsHandler({ docKey, section }) {
    const doc = DOCS_INDEX[docKey];

    if (!doc) {
        return {
            error: `Unknown documentation key: ${docKey}`,
            availableDocs: Object.entries(DOCS_INDEX).map(([key, d]) => ({
                key,
                title: d.title,
                topics: d.topics
            }))
        };
    }

    const content = {
        key: docKey,
        title: doc.title,
        path: doc.path,
        summary: doc.summary,
        topics: doc.topics
    };

    if (docKey === 'integration-base') {
        content.sections = {
            'static-definition': {
                title: 'Static Definition',
                content: `Integration classes must define a static Definition property:

\`\`\`javascript
static Definition = {
    name: 'integration-name',     // Unique identifier
    version: '1.0.0',             // Semantic version
    modules: {                    // API modules used
        moduleName: { definition: require('@friggframework/api-module-name') }
    },
    options: {
        type: 'api',              // api, webhook, sync, transform, custom
        hasUserConfig: true,      // Requires user configuration
        display: {
            name: 'Display Name',
            description: 'Integration description',
            category: 'CRM',      // CRM, Finance, Communication, etc.
            icon: 'icon-name'
        }
    },
    capabilities: {
        auth: ['oauth2'],         // oauth2, api-key, basic, token, custom
        webhooks: true,
        sync: { bidirectional: true, incremental: true }
    }
};
\`\`\``
            },
            'lifecycle-methods': {
                title: 'Lifecycle Methods',
                content: `Required lifecycle methods:

\`\`\`javascript
// Called when integration is created
async onCreate({ integrationId }) {
    await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
}

// Called when integration config is updated
async onUpdate(params) {
    await this.validateConfig();
}

// Called when integration is deleted
async onDelete(params) {
    // Cleanup: unregister webhooks, clear data
}

// Returns form configuration
async getConfigOptions() {
    return { jsonSchema: {}, uiSchema: {} };
}

// Verify authentication is valid
async testAuth() {
    const module = this.getModule('moduleName');
    return module.testAuth();
}
\`\`\``
            },
            'webhook-methods': {
                title: 'Webhook Methods',
                content: `Webhook handling methods:

\`\`\`javascript
// HTTP handler - no database context
async onWebhookReceived({ req, res }) {
    // Validate signature first
    const signature = req.headers['x-webhook-signature'];
    if (!this.verifySignature(req.body, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Queue for processing
    await this.queueWebhook({
        integrationId: req.params.integrationId,
        body: req.body,
        headers: req.headers
    });
    res.status(200).json({ received: true });
}

// Queue worker - has database context
async onWebhook({ data }) {
    const { body } = data;
    // Process webhook event with full integration context
}
\`\`\``
            }
        };
    }

    if (docKey === 'forms-config') {
        content.sections = {
            'json-schema': {
                title: 'JSON Schema',
                content: `Use JSON Schema to define configuration options:

\`\`\`javascript
async getConfigOptions() {
    return {
        jsonSchema: {
            type: 'object',
            required: ['workspace'],
            properties: {
                workspace: {
                    type: 'string',
                    title: 'Workspace',
                    enum: ['ws1', 'ws2'],       // Static options
                    enumNames: ['Workspace 1', 'Workspace 2']
                },
                syncEnabled: {
                    type: 'boolean',
                    title: 'Enable Sync',
                    default: true
                },
                syncInterval: {
                    type: 'integer',
                    title: 'Sync Interval (minutes)',
                    minimum: 5,
                    maximum: 1440,
                    default: 60
                }
            }
        },
        uiSchema: {
            workspace: { 'ui:placeholder': 'Select workspace...' },
            syncInterval: { 'ui:widget': 'range' }
        }
    };
}
\`\`\``
            },
            'dynamic-options': {
                title: 'Dynamic Options',
                content: `Fetch options dynamically from the API:

\`\`\`javascript
async getConfigOptions() {
    const module = this.getModule('myModule');
    const workspaces = await module.listWorkspaces();

    return {
        jsonSchema: {
            type: 'object',
            properties: {
                workspace: {
                    type: 'string',
                    title: 'Workspace',
                    enum: workspaces.map(w => w.id),
                    enumNames: workspaces.map(w => w.name)
                }
            }
        },
        uiSchema: {}
    };
}

// Refresh specific option
async refreshConfigOptions({ configKey, currentConfig }) {
    if (configKey === 'workspace') {
        const workspaces = await this.getModule('myModule').listWorkspaces();
        return { options: workspaces.map(w => ({ value: w.id, label: w.name })) };
    }
    return null;
}
\`\`\``
            }
        };
    }

    if (docKey === 'webhooks') {
        content.sections = {
            'signature-verification': {
                title: 'Signature Verification',
                content: `Always verify webhook signatures:

\`\`\`javascript
const crypto = require('crypto');

verifySignature(body, signature, secret) {
    const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
        Buffer.from(signature || '', 'utf8'),
        Buffer.from(expected, 'utf8')
    );
}
\`\`\``
            },
            'event-processing': {
                title: 'Event Processing',
                content: `Process webhook events in onWebhook:

\`\`\`javascript
async onWebhook({ data }) {
    const { body, headers } = data;
    const eventType = headers['x-event-type'] || body.event;

    switch (eventType) {
        case 'contact.created':
            await this.handleContactCreated(body.data);
            break;
        case 'deal.updated':
            await this.handleDealUpdated(body.data);
            break;
        case 'contact.deleted':
            await this.handleContactDeleted(body.data);
            break;
        default:
            console.log('Unhandled event:', eventType);
    }
}
\`\`\``
            }
        };
    }

    if (section && content.sections?.[section]) {
        return {
            ...content,
            section: content.sections[section]
        };
    }

    return content;
}

function createFriggMcpTools(options = {}) {
    if (options.gitCheckpointService) {
        setGitCheckpointService(options.gitCheckpointService);
    }

    return [
        {
            name: 'frigg_validate_schema',
            description: 'Validate integration, API module, or app definitions against Frigg schemas. Checks required fields, valid enums, and structural correctness.',
            inputSchema: {
                type: 'object',
                required: ['schemaType', 'content'],
                properties: {
                    schemaType: {
                        type: 'string',
                        enum: ['app-definition', 'integration-definition', 'api-module-definition'],
                        description: 'Type of schema to validate against'
                    },
                    content: {
                        type: 'string',
                        description: 'JSON content to validate (as string or object)'
                    }
                }
            },
            handler: validateSchemaHandler
        },
        {
            name: 'frigg_get_template',
            description: 'Get starter templates for Frigg integrations based on category (CRM, Finance, Communication, etc.) rather than auth type.',
            inputSchema: {
                type: 'object',
                required: ['category', 'integrationName'],
                properties: {
                    category: {
                        type: 'string',
                        enum: ['CRM', 'Finance', 'Communication', 'ECommerce', 'Storage', 'Webhook', 'Sync'],
                        description: 'Integration category determines the template structure'
                    },
                    integrationName: {
                        type: 'string',
                        description: 'Name for the integration (e.g., "hubspot", "stripe")'
                    },
                    options: {
                        type: 'object',
                        properties: {
                            webhooks: { type: 'boolean', description: 'Include webhook handling' },
                            authType: { type: 'string', description: 'Override default auth type' },
                            sourceModule: { type: 'string', description: 'For Sync: source API module' },
                            targetModule: { type: 'string', description: 'For Sync: target API module' }
                        }
                    }
                }
            },
            handler: getTemplateHandler
        },
        {
            name: 'frigg_check_patterns',
            description: 'Verify code follows Frigg architectural patterns. Checks for required base classes, lifecycle methods, and proper structure.',
            inputSchema: {
                type: 'object',
                required: ['code', 'fileType'],
                properties: {
                    code: { type: 'string', description: 'Source code to analyze' },
                    fileType: {
                        type: 'string',
                        enum: ['integration', 'api-module', 'handler', 'use-case', 'repository'],
                        description: 'Type of file being checked'
                    }
                }
            },
            handler: checkPatternsHandler
        },
        {
            name: 'frigg_list_modules',
            description: 'List available Frigg API modules from npm registry. Searches @friggframework/api-module-* packages.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        enum: ['CRM', 'Marketing', 'Communication', 'Finance', 'ECommerce', 'Analytics', 'Storage', 'Development', 'Productivity', 'Social', 'Other', 'all'],
                        description: 'Filter by category'
                    }
                }
            },
            handler: listModulesHandler
        },
        {
            name: 'frigg_run_tests',
            description: 'Execute Jest tests for generated code',
            inputSchema: {
                type: 'object',
                properties: {
                    testPattern: {
                        type: 'string',
                        description: 'Test file pattern or path (e.g., "integration.test.js")'
                    },
                    coverage: {
                        type: 'boolean',
                        description: 'Generate coverage report'
                    },
                    watch: {
                        type: 'boolean',
                        description: 'Run in watch mode'
                    }
                }
            },
            handler: runTestsHandler
        },
        {
            name: 'frigg_security_scan',
            description: 'Scan code for security vulnerabilities including hardcoded credentials, injection risks, and missing validation',
            inputSchema: {
                type: 'object',
                required: ['code'],
                properties: {
                    code: { type: 'string', description: 'Code to scan' },
                    scanType: {
                        type: 'string',
                        enum: ['full', 'credentials', 'injection', 'validation'],
                        description: 'Type of security scan'
                    }
                }
            },
            handler: securityScanHandler
        },
        {
            name: 'frigg_git_checkpoint',
            description: 'Create git checkpoint before making changes. Records current HEAD for potential rollback.',
            inputSchema: {
                type: 'object',
                required: ['message'],
                properties: {
                    message: {
                        type: 'string',
                        description: 'Checkpoint description'
                    }
                }
            },
            handler: gitCheckpointHandler
        },
        {
            name: 'frigg_get_example',
            description: 'Get working examples of specific Frigg patterns and implementations',
            inputSchema: {
                type: 'object',
                required: ['pattern'],
                properties: {
                    pattern: {
                        type: 'string',
                        enum: ['crm-integration', 'webhook-handler', 'form-config', 'oauth2-flow', 'sync-pattern', 'api-module-complete'],
                        description: 'Pattern to get example for'
                    }
                }
            },
            handler: getExampleHandler
        },
        {
            name: 'frigg_search_docs',
            description: 'Search Frigg documentation by keyword or topic. Returns relevant documentation sections with relevance scores.',
            inputSchema: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query (e.g., "webhook signature", "json schema forms")'
                    },
                    topic: {
                        type: 'string',
                        enum: ['integration', 'api-module', 'webhooks', 'forms', 'encryption', 'testing', 'cli', 'deployment'],
                        description: 'Filter by topic'
                    },
                    limit: {
                        type: 'integer',
                        description: 'Maximum number of results (default: 5)',
                        default: 5
                    }
                }
            },
            handler: searchDocsHandler
        },
        {
            name: 'frigg_read_docs',
            description: 'Read detailed documentation for a specific Frigg topic with code examples.',
            inputSchema: {
                type: 'object',
                required: ['docKey'],
                properties: {
                    docKey: {
                        type: 'string',
                        enum: ['integration-base', 'api-module', 'forms-config', 'webhooks', 'encryption', 'repositories', 'use-cases', 'cli', 'infrastructure', 'testing'],
                        description: 'Documentation key to read'
                    },
                    section: {
                        type: 'string',
                        description: 'Specific section to read (e.g., "lifecycle-methods", "json-schema")'
                    }
                }
            },
            handler: readDocsHandler
        }
    ];
}

module.exports = {
    createFriggMcpTools,
    validateSchemaHandler,
    getTemplateHandler,
    checkPatternsHandler,
    listModulesHandler,
    runTestsHandler,
    securityScanHandler,
    gitCheckpointHandler,
    getExampleHandler,
    searchDocsHandler,
    readDocsHandler,
    setGitCheckpointService,
    NPMRegistryService,
    INTEGRATION_CATEGORIES,
    INTEGRATION_TYPES,
    CATEGORY_TEMPLATES,
    DOCS_INDEX
};
