const fs = require('fs');
const path = require('path');
const os = require('os');

class CredentialStorage {
    constructor(options = {}) {
        // Global storage in user home directory
        this.globalPath = path.join(os.homedir(), '.frigg-credentials.json');
        // Project-local storage (if in a Frigg project)
        this.localPath = path.join(process.cwd(), '.frigg-credentials.json');
        // Allow override via options
        this.customPath = options.path || null;
    }

    getStoragePath() {
        // Priority: custom > local (if exists) > global
        if (this.customPath) {
            return this.customPath;
        }
        if (fs.existsSync(this.localPath)) {
            return this.localPath;
        }
        return this.globalPath;
    }

    getWritePath() {
        // Priority: custom > local (if in project) > global
        if (this.customPath) {
            return this.customPath;
        }
        if (this.isInProject()) {
            return this.localPath;
        }
        return this.globalPath;
    }

    async load() {
        const filePath = this.getStoragePath();

        if (!fs.existsSync(filePath)) {
            return {
                _meta: {
                    version: 1,
                    warning: 'DO NOT COMMIT THIS FILE - contains sensitive credentials'
                },
                modules: {}
            };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            console.warn(`Warning: Could not read credentials file: ${err.message}`);
            return { _meta: { version: 1 }, modules: {} };
        }
    }

    async save(moduleName, credentials, authType) {
        const data = await this.load();

        data.modules[moduleName] = {
            ...credentials,
            authType,
            savedAt: new Date().toISOString(),
        };

        const targetPath = this.getWritePath();

        // Ensure directory exists
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));

        // Add to .gitignore if saving locally
        if (targetPath === this.localPath) {
            this.ensureGitIgnore();
        }

        return targetPath;
    }

    async get(moduleName) {
        const data = await this.load();
        return data.modules[moduleName] || null;
    }

    async list() {
        const data = await this.load();
        return Object.entries(data.modules).map(([name, creds]) => ({
            module: name,
            authType: creds.authType,
            savedAt: creds.savedAt,
            entity: creds.entity?.details?.name || creds.entity?.identifiers?.externalId || 'Unknown',
            hasAccessToken: !!(creds.tokens?.access_token || creds.apiKey),
            hasRefreshToken: !!creds.tokens?.refresh_token,
        }));
    }

    async delete(moduleName) {
        const data = await this.load();

        if (!data.modules[moduleName]) {
            return false;
        }

        delete data.modules[moduleName];

        const targetPath = this.getStoragePath();
        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
        return true;
    }

    async deleteAll() {
        const data = {
            _meta: {
                version: 1,
                warning: 'DO NOT COMMIT THIS FILE - contains sensitive credentials'
            },
            modules: {}
        };

        const targetPath = this.getStoragePath();
        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
    }

    isInProject() {
        // Check for indicators of a Frigg project
        const indicators = [
            path.join(process.cwd(), 'backend', 'index.js'),
            path.join(process.cwd(), 'infrastructure.js'),
            path.join(process.cwd(), 'backend', 'infrastructure.js'),
            path.join(process.cwd(), 'package.json'),
        ];

        for (const indicator of indicators) {
            if (fs.existsSync(indicator)) {
                // Additional check: look for frigg-related content in package.json
                if (indicator.endsWith('package.json')) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(indicator, 'utf8'));
                        if (pkg.dependencies?.['@friggframework/core'] ||
                            pkg.devDependencies?.['@friggframework/core'] ||
                            pkg.name?.includes('frigg')) {
                            return true;
                        }
                    } catch {
                        // Ignore parse errors
                    }
                } else {
                    return true;
                }
            }
        }

        return false;
    }

    ensureGitIgnore() {
        const gitignorePath = path.join(process.cwd(), '.gitignore');
        const entry = '.frigg-credentials.json';

        try {
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                if (!content.includes(entry)) {
                    fs.appendFileSync(gitignorePath, `\n# Frigg auth credentials (DO NOT COMMIT)\n${entry}\n`);
                }
            } else {
                // Create new .gitignore
                fs.writeFileSync(gitignorePath, `# Frigg auth credentials (DO NOT COMMIT)\n${entry}\n`);
            }
        } catch (err) {
            console.warn(`Warning: Could not update .gitignore: ${err.message}`);
        }
    }
}

module.exports = { CredentialStorage };
