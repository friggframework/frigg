const { IAgentFramework, NotImplementedError } = require('./domain/interfaces/agent-framework');
const { IValidationPipeline } = require('./domain/interfaces/validation-pipeline');

const { AgentEvent, AgentEventType } = require('./domain/entities/agent-event');
const { AgentProposal, ProposalStatus } = require('./domain/entities/agent-proposal');

const { VercelAIAdapter, SUPPORTED_PROVIDERS } = require('./infrastructure/adapters/vercel-ai-adapter');
const { ClaudeAgentAdapter } = require('./infrastructure/adapters/claude-agent-adapter');

const { ValidationPipeline, ValidationLayer, LAYER_WEIGHTS } = require('./infrastructure/validation/validation-pipeline');

const { createFriggMcpTools, KNOWN_MODULES } = require('./infrastructure/mcp/frigg-tools');

const { GitCheckpointService } = require('./infrastructure/git/git-checkpoint-service');

const { AgentStreamHandler } = require('./infrastructure/streaming/agent-stream-handler');

module.exports = {
    IAgentFramework,
    IValidationPipeline,
    NotImplementedError,

    AgentEvent,
    AgentEventType,
    AgentProposal,
    ProposalStatus,

    VercelAIAdapter,
    ClaudeAgentAdapter,
    SUPPORTED_PROVIDERS,

    ValidationPipeline,
    ValidationLayer,
    LAYER_WEIGHTS,

    createFriggMcpTools,
    KNOWN_MODULES,

    GitCheckpointService,
    AgentStreamHandler
};
