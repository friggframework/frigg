/**
 * Netlify Deploy, Preflight Check, and Teardown
 *
 * Implements the provider plugin deploy lifecycle:
 *   - preflightCheck() — verify prerequisites before deploy
 *   - deploy() — generate config and deploy to Netlify
 *   - teardown() — remove deployed resources
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateNetlifyToml, generateNetlifyEnvTemplate } = require('./generate-netlify-config');
const { validateNetlifyConfig } = require('./validate');

/**
 * Check if a CLI tool is installed and available on PATH
 * @param {string} command
 * @returns {boolean}
 */
function isCommandAvailable(command) {
    try {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${cmd} ${command}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Pre-deploy checks — verify everything needed to deploy is in place.
 *
 * @param {Object} [appDefinition] - Frigg app definition
 * @returns {Promise<{ ready: boolean, missing: string[] }>}
 */
async function preflightCheck(appDefinition) {
    const missing = [];

    // Check for Netlify CLI or auth token
    const hasNetlifyCli = isCommandAvailable('netlify');
    const hasAuthToken = !!process.env.NETLIFY_AUTH_TOKEN;

    if (!hasNetlifyCli && !hasAuthToken) {
        missing.push(
            'Netlify CLI (npm install -g netlify-cli) or NETLIFY_AUTH_TOKEN environment variable'
        );
    }

    // Check for database configuration
    if (!process.env.DATABASE_URL) {
        missing.push(
            'DATABASE_URL environment variable (Neon PostgreSQL or MongoDB Atlas connection string)'
        );
    }

    // Check for QStash if configured
    if (appDefinition?.queue?.provider === 'qstash') {
        if (!process.env.QSTASH_TOKEN) {
            missing.push('QSTASH_TOKEN environment variable (from console.upstash.com)');
        }
    }

    // Validate app definition if provided
    if (appDefinition) {
        const validation = validateNetlifyConfig(appDefinition);
        for (const error of validation.errors) {
            missing.push(error);
        }
    }

    return {
        ready: missing.length === 0,
        missing,
    };
}

/**
 * Deploy the Frigg app to Netlify.
 *
 * Steps:
 *   1. Validate prerequisites (preflightCheck)
 *   2. Generate netlify.toml from appDefinition
 *   3. Run build command
 *   4. Deploy via Netlify CLI or git-push
 *
 * @param {Object} appDefinition - Frigg app definition
 * @param {Object} [options]
 * @param {string} [options.stage] - Deployment stage (production, staging, dev)
 * @param {boolean} [options.prod] - Deploy to production (default: draft deploy)
 * @param {boolean} [options.dryRun] - Generate config without deploying
 * @param {string} [options.dir] - Deploy directory (default: current directory)
 * @param {string} [options.functionsDir] - Functions directory (default: netlify/functions)
 * @returns {Promise<{ url: string, functionUrls: Object, logs: string[] }>}
 */
async function deploy(appDefinition, options = {}) {
    const {
        stage = 'production',
        prod = true,
        dryRun = false,
        dir = process.cwd(),
        functionsDir = 'netlify/functions',
    } = options;

    const logs = [];
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };

    // 1. Preflight check
    log('[Netlify Deploy] Running preflight checks...');
    const preflight = await preflightCheck(appDefinition);
    if (!preflight.ready) {
        const error = new Error(
            `Preflight check failed:\n  - ${preflight.missing.join('\n  - ')}`
        );
        error.missing = preflight.missing;
        throw error;
    }
    log('[Netlify Deploy] Preflight checks passed');

    // 2. Generate netlify.toml
    log('[Netlify Deploy] Generating netlify.toml...');
    const toml = generateNetlifyToml(appDefinition, { functionsDir });
    const tomlPath = path.join(dir, 'netlify.toml');
    fs.writeFileSync(tomlPath, toml, 'utf-8');
    log(`[Netlify Deploy] Written ${tomlPath}`);

    // 3. Generate env template (informational)
    const envTemplate = generateNetlifyEnvTemplate(appDefinition);
    const missingEnvVars = Object.keys(envTemplate).filter(
        (key) => !process.env[key]
    );
    if (missingEnvVars.length > 0) {
        log(
            `[Netlify Deploy] Warning: ${missingEnvVars.length} env vars not set locally: ${missingEnvVars.join(', ')}`
        );
        log(
            '  These should be configured in your Netlify site settings.'
        );
    }

    if (dryRun) {
        log('[Netlify Deploy] Dry run — skipping actual deployment');
        return { url: '(dry-run)', functionUrls: {}, logs };
    }

    // 4. Deploy via Netlify CLI
    log('[Netlify Deploy] Deploying to Netlify...');

    const result = await runNetlifyDeploy({ prod, dir, functionsDir, logs, log });

    return result;
}

/**
 * Run `netlify deploy` and capture the output.
 */
function runNetlifyDeploy({ prod, dir, functionsDir, logs, log }) {
    return new Promise((resolve, reject) => {
        const args = ['deploy'];
        if (prod) args.push('--prod');
        args.push('--dir', dir);
        args.push('--functions', functionsDir);

        const netlifyCmd = isCommandAvailable('netlify') ? 'netlify' : 'npx';
        const fullArgs = netlifyCmd === 'npx' ? ['netlify-cli', ...args] : args;

        const child = spawn(netlifyCmd, fullArgs, {
            cwd: dir,
            stdio: ['inherit', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text);
        });

        child.on('error', (error) => {
            reject(new Error(`Failed to run netlify deploy: ${error.message}`));
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `netlify deploy exited with code ${code}\n${stderr}`
                    )
                );
                return;
            }

            // Parse URL from output
            const urlMatch = stdout.match(/Website URL:\s+(https?:\/\/\S+)/);
            const url = urlMatch ? urlMatch[1] : '(url not found in output)';

            log(`[Netlify Deploy] Deployed to: ${url}`);
            logs.push(stdout);

            resolve({ url, functionUrls: {}, logs });
        });
    });
}

/**
 * Tear down / remove Netlify deployment.
 *
 * Netlify sites are managed via the web UI or CLI. This function
 * deletes the generated config file and optionally deletes the site.
 *
 * @param {Object} appDefinition
 * @param {Object} [options]
 * @param {boolean} [options.deleteSite] - Also delete the Netlify site (destructive)
 * @param {string} [options.dir] - Project directory
 */
async function teardown(appDefinition, options = {}) {
    const { deleteSite = false, dir = process.cwd() } = options;

    // Remove generated netlify.toml
    const tomlPath = path.join(dir, 'netlify.toml');
    if (fs.existsSync(tomlPath)) {
        fs.unlinkSync(tomlPath);
        console.log('[Netlify Teardown] Removed netlify.toml');
    }

    if (deleteSite) {
        if (!isCommandAvailable('netlify')) {
            throw new Error(
                'Netlify CLI required for site deletion. Install with: npm install -g netlify-cli'
            );
        }

        console.log('[Netlify Teardown] Deleting Netlify site...');
        execSync('netlify sites:delete --force', {
            cwd: dir,
            stdio: 'inherit',
        });
        console.log('[Netlify Teardown] Site deleted');
    }
}

module.exports = { deploy, preflightCheck, teardown };
