const { IAgentFramework } = require('../../domain/interfaces/agent-framework');
const { AgentEvent } = require('../../domain/entities/agent-event');

const DEFAULT_CONFIG = {
    model: 'gpt-4-turbo',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0.7
};

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google', 'azure', 'amazon-bedrock'];

class VercelAIAdapter extends IAgentFramework {
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tools = [];
        this.approvalConfig = {
            requireApproval: true,
            confidenceThreshold: 80
        };
        this._paused = false;
    }

    getCapabilities() {
        return {
            streaming: true,
            toolCalling: true,
            mcpSupport: true,
            multiProvider: true,
            providers: SUPPORTED_PROVIDERS,
            nativeMcp: false,
            subagentOrchestration: false
        };
    }

    async loadMcpTools(serverConfig) {
        const { tools = [] } = serverConfig;

        this.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
            execute: tool.handler
        }));

        return this.tools;
    }

    createStreamingHandler(onEvent) {
        return {
            onContent: (text) => {
                onEvent(AgentEvent.content(text));
            },
            onToolCall: (name, args) => {
                onEvent(AgentEvent.toolCall(name, args));
            },
            onToolResult: (name, result) => {
                onEvent(AgentEvent.toolResult(name, result));
            },
            onFinish: (result) => {
                if (result?.usage) {
                    onEvent(AgentEvent.usage(result.usage));
                }
                onEvent(AgentEvent.done());
            },
            onError: (error) => {
                onEvent(AgentEvent.error(error));
            }
        };
    }

    buildSystemPrompt(context = {}) {
        const { integrationContext = '' } = context;

        return `You are an AI agent specialized in building integrations with the Frigg Framework.

Your role is to help developers create, modify, and maintain integrations following Frigg's hexagonal architecture patterns.

${integrationContext ? `Current context: ${integrationContext}` : ''}

Key patterns to follow:
- Always extend IntegrationBase for integration classes
- Implement required methods: onCreate, onUpdate, onDelete, getConfigOptions, testAuth
- Use static Definition property for integration metadata
- Follow OAuth2 patterns for authentication
- Use environment variables for credentials, never hardcode

When generating code:
1. Use frigg_validate_schema to validate JSON definitions
2. Use frigg_check_patterns to verify code follows Frigg patterns
3. Use frigg_security_scan to check for vulnerabilities
4. Always include test files for generated code

Validation is critical - run validation tools after every code generation step.`;
    }

    async runAgent(params) {
        await this.validateRunParams(params);

        const { prompt, context = {}, onEvent } = params;

        if (params.mock) {
            return {
                stream: this._mockResponse ? this._mockResponse() : this._createMockStream(),
                cancel: () => {}
            };
        }

        throw new Error('Vercel AI SDK not configured. Install "ai" package and set API keys.');
    }

    async *_createMockStream() {
        yield AgentEvent.content('Mock response - Vercel AI SDK not initialized');
        yield AgentEvent.done();
    }

    configureHumanApproval(config) {
        this.approvalConfig = { ...this.approvalConfig, ...config };
    }

    pause() {
        this._paused = true;
    }

    resume() {
        this._paused = false;
    }

    isPaused() {
        return this._paused;
    }
}

module.exports = { VercelAIAdapter, DEFAULT_CONFIG, SUPPORTED_PROVIDERS };
