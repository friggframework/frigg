const {
    VercelAIAdapter,
    ClaudeAgentAdapter,
    ValidationPipeline,
    AgentProposal,
    AgentEvent,
    AgentStreamHandler,
    GitCheckpointService,
    createFriggMcpTools
} = require('../../src');

describe('Agent Workflow Integration', () => {
    describe('complete agent workflow', () => {
        let adapter;
        let validationPipeline;
        let gitService;
        let streamHandler;
        let mockIo;

        beforeEach(() => {
            adapter = new VercelAIAdapter({ skipApiCheck: true });
            validationPipeline = new ValidationPipeline();

            const mockExec = jest.fn().mockResolvedValue({ stdout: 'abc123\n' });
            gitService = new GitCheckpointService({ execCommand: mockExec });

            mockIo = {
                to: jest.fn().mockReturnThis(),
                emit: jest.fn()
            };
            streamHandler = new AgentStreamHandler({ io: mockIo });
        });

        it('should integrate all components', async () => {
            const mcpTools = createFriggMcpTools();
            expect(mcpTools.length).toBeGreaterThan(0);

            await adapter.loadMcpTools({ tools: mcpTools });
            expect(adapter.tools.length).toBe(mcpTools.length);

            const session = streamHandler.createSession({ socketId: 'test-socket' });
            expect(session.status).toBe('active');

            const checkpoint = await gitService.createCheckpoint('Before integration');
            expect(checkpoint).toHaveProperty('hash');

            const files = [{
                path: 'src/integrations/test.js',
                content: `
const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        version: '1.0.0',
        modules: {},
        display: { name: 'Test', description: 'Test integration' }
    };

    async onCreate(params) {}
    async onUpdate(params) {}
    async onDelete(params) {}
    async getConfigOptions() { return { jsonSchema: {}, uiSchema: {} }; }
    async testAuth() { return true; }
}

module.exports = { TestIntegration };
`,
                action: 'create'
            }];

            const validationResult = await validationPipeline.validate(files);
            expect(validationResult.confidence).toBeGreaterThan(80);

            const proposal = new AgentProposal({
                id: 'proposal-1',
                files,
                validation: validationResult,
                checkpointId: checkpoint.id
            });

            expect(proposal.status).toBe('pending');
            expect(proposal.canRollback()).toBe(true);

            streamHandler.emitProposal(session.id, {
                id: proposal.id,
                files: proposal.files,
                confidence: validationResult.confidence
            });

            expect(mockIo.emit).toHaveBeenCalledWith('agent:proposal', expect.anything());

            proposal.approve();
            expect(proposal.status).toBe('approved');
        });

        it('should handle validation failure workflow', async () => {
            const files = [{
                path: 'src/integrations/bad.js',
                content: `const apiKey = 'sk-test-123456789';`,
                action: 'create'
            }];

            const validationResult = await validationPipeline.validate(files);
            expect(validationResult.confidence).toBeLessThan(95);

            const proposal = new AgentProposal({
                id: 'proposal-2',
                files,
                validation: validationResult
            });

            expect(validationResult.recommendation).not.toBe('auto_approve');
        });

        it('should stream events through workflow', () => {
            const session = streamHandler.createSession({ socketId: 'test' });
            const emitter = streamHandler.createEventEmitter(session.id);

            emitter(AgentEvent.content('Starting integration...'));
            emitter(AgentEvent.toolCall('frigg_get_template', { type: 'oauth2', name: 'test' }));
            emitter(AgentEvent.toolResult('frigg_get_template', { template: '...' }));
            emitter(AgentEvent.content('Generated integration code'));

            expect(mockIo.emit).toHaveBeenCalledTimes(4);
        });
    });

    describe('adapter capabilities', () => {
        it('should expose correct capabilities for VercelAIAdapter', () => {
            const adapter = new VercelAIAdapter();
            const caps = adapter.getCapabilities();

            expect(caps.streaming).toBe(true);
            expect(caps.multiProvider).toBe(true);
            expect(caps.nativeMcp).toBe(false);
        });

        it('should expose correct capabilities for ClaudeAgentAdapter', () => {
            const adapter = new ClaudeAgentAdapter();
            const caps = adapter.getCapabilities();

            expect(caps.streaming).toBe(true);
            expect(caps.multiProvider).toBe(false);
            expect(caps.nativeMcp).toBe(true);
            expect(caps.subagentOrchestration).toBe(true);
        });
    });

    describe('HITL workflow', () => {
        it('should pause and resume agent execution', () => {
            const adapter = new ClaudeAgentAdapter();

            expect(adapter.isPaused()).toBe(false);

            adapter.pause();
            expect(adapter.isPaused()).toBe(true);

            adapter.resume();
            expect(adapter.isPaused()).toBe(false);
        });

        it('should configure human approval thresholds', () => {
            const adapter = new ClaudeAgentAdapter();

            adapter.configureHumanApproval({
                requireApproval: true,
                confidenceThreshold: 95
            });

            expect(adapter.approvalConfig.confidenceThreshold).toBe(95);
        });
    });

    describe('validation confidence scoring', () => {
        it('should score valid integration highly', async () => {
            const pipeline = new ValidationPipeline();

            const files = [{
                path: 'src/integrations/good.js',
                content: `
const { IntegrationBase } = require('@friggframework/core');

class GoodIntegration extends IntegrationBase {
    static Definition = {
        name: 'good',
        version: '1.0.0',
        modules: {},
        display: { name: 'Good', description: 'Good integration' }
    };

    async onCreate(params) {}
    async onUpdate(params) {}
    async onDelete(params) {}
    async getConfigOptions() { return { jsonSchema: {}, uiSchema: {} }; }
    async testAuth() { return true; }
}

module.exports = { GoodIntegration };
`,
                action: 'create'
            }];

            const result = await pipeline.validate(files);
            expect(result.confidence).toBeGreaterThanOrEqual(90);
        });

        it('should score insecure code lower', async () => {
            const pipeline = new ValidationPipeline();

            const files = [{
                path: 'src/config.js',
                content: `
const password = 'super-secret-123';
const query = "SELECT * FROM users WHERE id = " + userId;
`,
                action: 'create'
            }];

            const result = await pipeline.validate(files);
            expect(result.confidence).toBeLessThan(100);
            expect(result.layers.security.passed).toBe(false);
            expect(result.layers.security.vulnerabilities.length).toBeGreaterThan(0);
        });
    });

    describe('MCP tools integration', () => {
        it('should validate schema through tool handler', async () => {
            const tools = createFriggMcpTools();
            const validateTool = tools.find(t => t.name === 'frigg_validate_schema');

            const result = await validateTool.handler({
                schemaType: 'integration-definition',
                content: JSON.stringify({
                    name: 'hubspot',
                    version: '1.0.0'
                })
            });

            expect(result.valid).toBe(true);
        });

        it('should get template through tool handler', async () => {
            const tools = createFriggMcpTools();
            const templateTool = tools.find(t => t.name === 'frigg_get_template');

            const result = await templateTool.handler({
                category: 'CRM',
                integrationName: 'hubspot'
            });

            expect(result.template).toContain('IntegrationBase');
            expect(result.template).toContain('Hubspot');
        });

        it('should check patterns through tool handler', async () => {
            const tools = createFriggMcpTools();
            const patternsTool = tools.find(t => t.name === 'frigg_check_patterns');

            const result = await patternsTool.handler({
                code: `
class MyIntegration extends IntegrationBase {
    static Definition = { name: 'test', version: '1.0.0' };
    async onCreate() {}
    async onUpdate() {}
    async onDelete() {}
    async getConfigOptions() {}
    async testAuth() {}
}`,
                fileType: 'integration'
            });

            expect(result.compliant).toBe(true);
        });
    });
});
