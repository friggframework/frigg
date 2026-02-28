/**
 * InteractivePromptAdapter - Handles prompts in terminal mode or IPC mode
 *
 * Presentation Layer - Adapts prompt interfaces for different contexts:
 * - Terminal mode: Uses @inquirer/prompts for direct CLI interaction
 * - IPC mode: Outputs JSON to stdout and reads responses from stdin
 *   (used when Management UI spawns the CLI process)
 */

const { confirm, select, input } = require('@inquirer/prompts');
const { randomUUID } = require('crypto');

/**
 * Factory for creating the appropriate prompt adapter
 */
class InteractivePromptAdapter {
    /**
     * Create a prompt adapter based on mode
     * @param {object} options - Options
     * @param {string} options.mode - 'terminal' or 'ipc'
     * @returns {TerminalPromptAdapter|IpcPromptAdapter}
     */
    static create(options = {}) {
        // Check for IPC mode via environment variable or explicit option
        const isIpcMode = options.mode === 'ipc' || process.env.FRIGG_IPC === 'true';

        if (isIpcMode) {
            return new IpcPromptAdapter();
        }

        return new TerminalPromptAdapter();
    }
}

/**
 * Terminal-based prompt adapter using @inquirer/prompts
 */
class TerminalPromptAdapter {
    /**
     * Show a confirmation prompt
     * @param {object} options - Prompt options
     * @param {string} options.message - Prompt message
     * @param {boolean} options.default - Default value
     * @returns {Promise<boolean>}
     */
    async confirm(options) {
        return confirm({
            message: options.message,
            default: options.default
        });
    }

    /**
     * Show a selection prompt
     * @param {object} options - Prompt options
     * @param {string} options.message - Prompt message
     * @param {Array} options.choices - Array of {value, name} choices
     * @returns {Promise<string>}
     */
    async select(options) {
        return select({
            message: options.message,
            choices: options.choices
        });
    }

    /**
     * Show a text input prompt
     * @param {object} options - Prompt options
     * @param {string} options.message - Prompt message
     * @param {string} options.default - Default value
     * @returns {Promise<string>}
     */
    async input(options) {
        return input({
            message: options.message,
            default: options.default
        });
    }

    /**
     * Prompt user to resolve a failed pre-flight check
     * @param {object} check - Pre-flight check result
     * @returns {Promise<{shouldResolve: boolean, composePath?: string}>}
     */
    async promptForResolution(check) {
        if (!check.canResolve) {
            return { shouldResolve: false };
        }

        const shouldResolve = await this.confirm({
            message: check.resolution.prompt,
            default: true
        });

        const result = { shouldResolve };

        if (check.resolution.composePath) {
            result.composePath = check.resolution.composePath;
        }

        return result;
    }
}

/**
 * IPC-based prompt adapter for Management UI integration
 * Outputs JSON prompts to stdout, reads responses from stdin
 */
class IpcPromptAdapter {
    constructor() {
        this._pendingPrompts = new Map();
        this._stdinBuffer = '';
        this._stdinListenerSetup = false;
    }

    /**
     * Setup stdin listener for IPC responses (lazy initialization)
     */
    _setupStdinListener() {
        if (this._stdinListenerSetup) return;
        this._stdinListenerSetup = true;

        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            this._stdinBuffer += chunk;

            // Process complete lines
            const lines = this._stdinBuffer.split('\n');
            this._stdinBuffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;

                const ipcMessage = this._parseIpcMessage(line);
                if (ipcMessage && ipcMessage.type === 'prompt_response') {
                    this._resolvePrompt(ipcMessage.requestId, ipcMessage.response);
                }
            }
        });

        process.stdin.on('end', () => {
            // stdin closed - resolve any pending prompts with default/false
            for (const [requestId, resolver] of this._pendingPrompts) {
                resolver(false);
            }
            this._pendingPrompts.clear();
        });

        // Resume stdin to start receiving data
        process.stdin.resume();
    }

    /**
     * Generate a unique request ID
     * @returns {string}
     */
    _generateRequestId() {
        return `prompt-${randomUUID().split('-')[0]}`;
    }

    /**
     * Format IPC output message
     * @param {string} type - Message type
     * @param {object} data - Message data
     * @returns {string} JSON string with newline
     */
    _formatIpcOutput(type, data) {
        const message = {
            frigg_ipc: type,
            ...data
        };
        return JSON.stringify(message) + '\n';
    }

    /**
     * Parse an IPC message from stdin
     * @param {string} message - Raw message string
     * @returns {object|null} Parsed message or null if not IPC
     */
    _parseIpcMessage(message) {
        try {
            const parsed = JSON.parse(message);
            if (!parsed.frigg_ipc) {
                return null;
            }
            return {
                type: parsed.frigg_ipc,
                requestId: parsed.requestId,
                response: parsed.response
            };
        } catch {
            return null;
        }
    }

    /**
     * Resolve a pending prompt with a response
     * @param {string} requestId - Request ID
     * @param {any} response - Response value
     */
    _resolvePrompt(requestId, response) {
        const resolver = this._pendingPrompts.get(requestId);
        if (resolver) {
            resolver(response);
            this._pendingPrompts.delete(requestId);
        }
    }

    /**
     * Handle a response from the Management UI
     * @param {string} requestId - Request ID
     * @param {any} response - Response value
     */
    handleResponse(requestId, response) {
        this._resolvePrompt(requestId, response);
    }

    /**
     * Show a confirmation prompt via IPC
     * @param {object} options - Prompt options
     * @returns {Promise<boolean>}
     */
    async confirm(options) {
        // Setup stdin listener before sending prompt
        this._setupStdinListener();

        const requestId = this._generateRequestId();

        const output = this._formatIpcOutput('prompt_request', {
            requestId,
            prompt: {
                type: 'confirm',
                message: options.message,
                default: options.default
            }
        });

        process.stdout.write(output);

        return new Promise((resolve) => {
            this._pendingPrompts.set(requestId, resolve);
        });
    }

    /**
     * Show a selection prompt via IPC
     * @param {object} options - Prompt options
     * @returns {Promise<string>}
     */
    async select(options) {
        // Setup stdin listener before sending prompt
        this._setupStdinListener();

        const requestId = this._generateRequestId();

        const output = this._formatIpcOutput('prompt_request', {
            requestId,
            prompt: {
                type: 'select',
                message: options.message,
                choices: options.choices
            }
        });

        process.stdout.write(output);

        return new Promise((resolve) => {
            this._pendingPrompts.set(requestId, resolve);
        });
    }

    /**
     * Show a text input prompt via IPC
     * @param {object} options - Prompt options
     * @returns {Promise<string>}
     */
    async input(options) {
        // Setup stdin listener before sending prompt
        this._setupStdinListener();

        const requestId = this._generateRequestId();

        const output = this._formatIpcOutput('prompt_request', {
            requestId,
            prompt: {
                type: 'input',
                message: options.message,
                default: options.default
            }
        });

        process.stdout.write(output);

        return new Promise((resolve) => {
            this._pendingPrompts.set(requestId, resolve);
        });
    }

    /**
     * Prompt user to resolve a failed pre-flight check via IPC
     * @param {object} check - Pre-flight check result
     * @returns {Promise<{shouldResolve: boolean, composePath?: string}>}
     */
    async promptForResolution(check) {
        if (!check.canResolve) {
            return { shouldResolve: false };
        }

        const shouldResolve = await this.confirm({
            message: check.resolution.prompt,
            default: true
        });

        const result = { shouldResolve };

        if (check.resolution.composePath) {
            result.composePath = check.resolution.composePath;
        }

        return result;
    }
}

module.exports = {
    InteractivePromptAdapter,
    TerminalPromptAdapter,
    IpcPromptAdapter
};
