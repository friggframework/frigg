const { IAgentFramework } = require('../../../../src/domain/interfaces/agent-framework');

describe('IAgentFramework Interface', () => {
    describe('interface contract', () => {
        it('should define required methods', () => {
            const framework = new IAgentFramework();

            expect(typeof framework.runAgent).toBe('function');
            expect(typeof framework.loadMcpTools).toBe('function');
            expect(typeof framework.getCapabilities).toBe('function');
        });

        it('runAgent should throw NotImplementedError by default', async () => {
            const framework = new IAgentFramework();

            await expect(framework.runAgent({})).rejects.toThrow('Not implemented');
        });

        it('loadMcpTools should throw NotImplementedError by default', async () => {
            const framework = new IAgentFramework();

            await expect(framework.loadMcpTools({})).rejects.toThrow('Not implemented');
        });

        it('getCapabilities should throw NotImplementedError by default', () => {
            const framework = new IAgentFramework();

            expect(() => framework.getCapabilities()).toThrow('Not implemented');
        });
    });

    describe('AgentRunParams validation', () => {
        it('should require prompt parameter', async () => {
            const framework = new IAgentFramework();

            await expect(framework.validateRunParams({})).rejects.toThrow('prompt is required');
        });

        it('should accept valid params', async () => {
            const framework = new IAgentFramework();
            const params = {
                prompt: 'Create a HubSpot integration',
                tools: [],
                model: { provider: 'openrouter', id: 'anthropic/claude-sonnet-4' }
            };

            await expect(framework.validateRunParams(params)).resolves.toBe(true);
        });
    });
});

describe('FrameworkCapabilities', () => {
    it('should have required capability flags', () => {
        const capabilities = {
            supportsStreaming: true,
            supportsMcp: true,
            supportsMemory: false,
            supportsMultiAgent: false
        };

        expect(capabilities).toHaveProperty('supportsStreaming');
        expect(capabilities).toHaveProperty('supportsMcp');
        expect(capabilities).toHaveProperty('supportsMemory');
        expect(capabilities).toHaveProperty('supportsMultiAgent');
    });
});
