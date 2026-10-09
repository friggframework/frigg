/**
 * WebSocket Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - WebSocket API Gateway configuration
 * - WebSocket route handlers ($connect, $default, $disconnect)
 * - WebSocket function definitions
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

class WebsocketBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'WebsocketBuilder';
    }

    shouldExecute(appDefinition) {
        // Skip WebSocket in local mode (when FRIGG_SKIP_AWS_DISCOVERY is set)
        // API Gateway WebSocket is an AWS-specific service that should only be created in production
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        return appDefinition.websockets?.enable === true;
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.websockets) {
            result.addError('WebSocket configuration is missing');
            return result;
        }

        return result;
    }

    /**
     * Build WebSocket infrastructure
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring WebSocket API Gateway...`);

        const result = {
            functions: {},
        };

        // Create default WebSocket handler
        result.functions.defaultWebsocket = {
            handler: 'node_modules/@friggframework/core/handlers/routers/websocket.handler',
            events: [
                { websocket: { route: '$connect' } },
                { websocket: { route: '$default' } },
                { websocket: { route: '$disconnect' } },
            ],
        };

        console.log('  ✅ WebSocket functions configured ($connect, $default, $disconnect)');
        console.log(`[${this.name}] ✅ WebSocket configuration completed`);

        return result;
    }
}

module.exports = { WebsocketBuilder };

