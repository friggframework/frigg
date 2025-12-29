class NotImplementedError extends Error {
    constructor(method) {
        super(`Not implemented: ${method}`);
        this.name = 'NotImplementedError';
    }
}

class IAgentFramework {
    async runAgent(_params) {
        throw new NotImplementedError('runAgent');
    }

    async loadMcpTools(_serverConfig) {
        throw new NotImplementedError('loadMcpTools');
    }

    getCapabilities() {
        throw new NotImplementedError('getCapabilities');
    }

    async validateRunParams(params) {
        if (!params.prompt) {
            throw new Error('prompt is required');
        }
        return true;
    }
}

module.exports = { IAgentFramework, NotImplementedError };
