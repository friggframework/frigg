/**
 * Tests for WebSocket Builder
 * 
 * Tests WebSocket API Gateway configuration
 */

const { WebsocketBuilder } = require('./websocket-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('WebsocketBuilder', () => {
    let websocketBuilder;

    beforeEach(() => {
        websocketBuilder = new WebsocketBuilder();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('shouldExecute()', () => {
        it('should return true when websockets are enabled', () => {
            const appDefinition = {
                websockets: { enable: true },
            };

            expect(websocketBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when websockets are disabled', () => {
            const appDefinition = {
                websockets: { enable: false },
            };

            expect(websocketBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when websockets are not defined', () => {
            const appDefinition = {};

            expect(websocketBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is set (local mode)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                websockets: { enable: true },
            };

            expect(websocketBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid websocket config', () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = websocketBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should error when websocket configuration is missing', () => {
            const appDefinition = {};

            const result = websocketBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('WebSocket configuration is missing');
        });
    });

    describe('build()', () => {
        it('should create defaultWebsocket function', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            expect(result.functions.defaultWebsocket).toBeDefined();
        });

        it('should configure correct handler path', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            expect(result.functions.defaultWebsocket.handler).toBe(
                'node_modules/@friggframework/core/handlers/routers/websocket.handler'
            );
        });

        it('should configure $connect route', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            const connectEvent = result.functions.defaultWebsocket.events.find(
                e => e.websocket?.route === '$connect'
            );

            expect(connectEvent).toBeDefined();
        });

        it('should configure $default route', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            const defaultEvent = result.functions.defaultWebsocket.events.find(
                e => e.websocket?.route === '$default'
            );

            expect(defaultEvent).toBeDefined();
        });

        it('should configure $disconnect route', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            const disconnectEvent = result.functions.defaultWebsocket.events.find(
                e => e.websocket?.route === '$disconnect'
            );

            expect(disconnectEvent).toBeDefined();
        });

        it('should configure all three WebSocket routes', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result = await websocketBuilder.build(appDefinition, {});

            expect(result.functions.defaultWebsocket.events).toHaveLength(3);
        });

        it('should not depend on discovered resources', async () => {
            const appDefinition = {
                websockets: {
                    enable: true,
                },
            };

            const result1 = await websocketBuilder.build(appDefinition, {});
            const result2 = await websocketBuilder.build(appDefinition, { vpcId: 'vpc-123' });

            expect(result1.functions).toEqual(result2.functions);
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = websocketBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('getName()', () => {
        it('should return WebsocketBuilder', () => {
            expect(websocketBuilder.getName()).toBe('WebsocketBuilder');
        });
    });
});

