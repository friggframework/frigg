/**
 * InteractivePromptAdapter Tests
 * Handles prompts in terminal mode (inquirer) or IPC mode (JSON over stdio)
 *
 * Tests follow TDD pattern - written BEFORE implementation
 */

// Mock @inquirer/prompts
jest.mock('@inquirer/prompts', () => ({
    confirm: jest.fn(),
    select: jest.fn(),
    input: jest.fn()
}));

const { confirm, select, input } = require('@inquirer/prompts');

// Import after mocks
const {
    InteractivePromptAdapter,
    TerminalPromptAdapter,
    IpcPromptAdapter
} = require('../../../../start-command/presentation/InteractivePromptAdapter');

describe('InteractivePromptAdapter', () => {
    describe('factory method - create()', () => {
        it('should create TerminalPromptAdapter when mode is terminal', () => {
            const adapter = InteractivePromptAdapter.create({ mode: 'terminal' });
            expect(adapter).toBeInstanceOf(TerminalPromptAdapter);
        });

        it('should create IpcPromptAdapter when mode is ipc', () => {
            const adapter = InteractivePromptAdapter.create({ mode: 'ipc' });
            expect(adapter).toBeInstanceOf(IpcPromptAdapter);
        });

        it('should default to terminal mode when no mode specified', () => {
            const adapter = InteractivePromptAdapter.create({});
            expect(adapter).toBeInstanceOf(TerminalPromptAdapter);
        });

        it('should use ipc mode when FRIGG_IPC env var is true', () => {
            const originalEnv = process.env.FRIGG_IPC;
            process.env.FRIGG_IPC = 'true';

            const adapter = InteractivePromptAdapter.create({});
            expect(adapter).toBeInstanceOf(IpcPromptAdapter);

            process.env.FRIGG_IPC = originalEnv;
        });
    });
});

describe('TerminalPromptAdapter', () => {
    let adapter;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new TerminalPromptAdapter();
    });

    describe('confirm()', () => {
        it('should call inquirer confirm with message', async () => {
            confirm.mockResolvedValue(true);

            const result = await adapter.confirm({
                message: 'Start Docker Desktop?',
                default: true
            });

            expect(result).toBe(true);
            expect(confirm).toHaveBeenCalledWith({
                message: 'Start Docker Desktop?',
                default: true
            });
        });

        it('should return false when user declines', async () => {
            confirm.mockResolvedValue(false);

            const result = await adapter.confirm({
                message: 'Continue?'
            });

            expect(result).toBe(false);
        });

        it('should use default value when provided', async () => {
            confirm.mockResolvedValue(false);

            await adapter.confirm({
                message: 'Continue?',
                default: false
            });

            expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
                default: false
            }));
        });
    });

    describe('select()', () => {
        it('should call inquirer select with options', async () => {
            select.mockResolvedValue('option1');

            const result = await adapter.select({
                message: 'Choose an option:',
                choices: [
                    { value: 'option1', name: 'Option 1' },
                    { value: 'option2', name: 'Option 2' }
                ]
            });

            expect(result).toBe('option1');
            expect(select).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Choose an option:'
            }));
        });

        it('should return selected value', async () => {
            select.mockResolvedValue('option2');

            const result = await adapter.select({
                message: 'Choose:',
                choices: [
                    { value: 'option1', name: 'Option 1' },
                    { value: 'option2', name: 'Option 2' }
                ]
            });

            expect(result).toBe('option2');
        });
    });

    describe('input()', () => {
        it('should call inquirer input with message', async () => {
            input.mockResolvedValue('user input');

            const result = await adapter.input({
                message: 'Enter value:'
            });

            expect(result).toBe('user input');
            expect(input).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Enter value:'
            }));
        });

        it('should use default value when provided', async () => {
            input.mockResolvedValue('default');

            await adapter.input({
                message: 'Enter value:',
                default: 'default'
            });

            expect(input).toHaveBeenCalledWith(expect.objectContaining({
                default: 'default'
            }));
        });
    });

    describe('promptForResolution()', () => {
        it('should prompt confirm for start_docker resolution', async () => {
            confirm.mockResolvedValue(true);

            const result = await adapter.promptForResolution({
                name: 'docker_running',
                status: 'failed',
                message: 'Docker is not running',
                canResolve: true,
                resolution: {
                    type: 'start_docker',
                    prompt: 'Would you like to start Docker Desktop?'
                }
            });

            expect(result.shouldResolve).toBe(true);
            expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Would you like to start Docker Desktop?'
            }));
        });

        it('should prompt confirm for start_docker_compose resolution', async () => {
            confirm.mockResolvedValue(true);

            const result = await adapter.promptForResolution({
                name: 'database_reachable',
                status: 'failed',
                message: 'Database not reachable',
                canResolve: true,
                resolution: {
                    type: 'start_docker_compose',
                    prompt: 'Would you like to run docker-compose up?',
                    composePath: '/test/docker-compose.yml'
                }
            });

            expect(result.shouldResolve).toBe(true);
            expect(result.composePath).toBe('/test/docker-compose.yml');
        });

        it('should return shouldResolve: false when user declines', async () => {
            confirm.mockResolvedValue(false);

            const result = await adapter.promptForResolution({
                name: 'docker_running',
                status: 'failed',
                message: 'Docker not running',
                canResolve: true,
                resolution: {
                    type: 'start_docker',
                    prompt: 'Start Docker?'
                }
            });

            expect(result.shouldResolve).toBe(false);
        });

        it('should return shouldResolve: false for non-resolvable checks', async () => {
            const result = await adapter.promptForResolution({
                name: 'docker_installed',
                status: 'failed',
                message: 'Docker not installed',
                canResolve: false,
                resolution: {
                    type: 'manual',
                    instructions: 'Install Docker manually'
                }
            });

            expect(result.shouldResolve).toBe(false);
            expect(confirm).not.toHaveBeenCalled();
        });
    });
});

describe('IpcPromptAdapter', () => {
    let adapter;
    let originalStdout;
    let mockStdout;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new IpcPromptAdapter();

        // Mock stdout.write
        mockStdout = jest.fn();
        originalStdout = process.stdout.write;
        process.stdout.write = mockStdout;
    });

    afterEach(() => {
        process.stdout.write = originalStdout;
    });

    describe('confirm()', () => {
        it('should output JSON prompt request to stdout', async () => {
            // Mock requestId generation for predictable test
            adapter._generateRequestId = () => 'test-id';

            const resultPromise = adapter.confirm({
                message: 'Start Docker?',
                default: true
            });

            // Resolve immediately for test
            adapter._resolvePrompt('test-id', true);

            const result = await resultPromise;

            expect(result).toBe(true);
            expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('frigg_ipc'));
            expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('prompt_request'));
            expect(mockStdout).toHaveBeenCalledWith(expect.stringContaining('confirm'));
        });

        it('should include requestId in output', async () => {
            adapter._generateRequestId = () => 'unique-id-123';
            adapter._resolvePrompt = jest.fn();

            // Start the promise but don't await yet
            adapter.confirm({ message: 'Test?' });

            // Give time for stdout.write to be called
            await new Promise(resolve => setTimeout(resolve, 10));

            const output = mockStdout.mock.calls[0][0];
            expect(output).toContain('unique-id-123');
        });

        it('should output newline-terminated JSON', async () => {
            adapter._generateRequestId = () => 'test-id';

            adapter.confirm({ message: 'Test?' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const output = mockStdout.mock.calls[0][0];
            expect(output.endsWith('\n')).toBe(true);
        });
    });

    describe('_parseIpcMessage()', () => {
        it('should parse valid prompt response', () => {
            const message = JSON.stringify({
                frigg_ipc: 'prompt_response',
                requestId: 'test-id',
                response: true
            });

            const result = adapter._parseIpcMessage(message);

            expect(result.type).toBe('prompt_response');
            expect(result.requestId).toBe('test-id');
            expect(result.response).toBe(true);
        });

        it('should return null for non-IPC messages', () => {
            const message = 'regular log message';
            const result = adapter._parseIpcMessage(message);

            expect(result).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            const message = '{ invalid json }';
            const result = adapter._parseIpcMessage(message);

            expect(result).toBeNull();
        });
    });

    describe('_formatIpcOutput()', () => {
        it('should format prompt request as JSON', () => {
            const output = adapter._formatIpcOutput('prompt_request', {
                requestId: 'test-123',
                prompt: {
                    type: 'confirm',
                    message: 'Continue?',
                    default: true
                }
            });

            const parsed = JSON.parse(output.trim());
            expect(parsed.frigg_ipc).toBe('prompt_request');
            expect(parsed.requestId).toBe('test-123');
            expect(parsed.prompt.type).toBe('confirm');
        });

        it('should add newline to output', () => {
            const output = adapter._formatIpcOutput('prompt_request', {});
            expect(output.endsWith('\n')).toBe(true);
        });
    });

    describe('handleResponse()', () => {
        it('should resolve pending prompt with response', async () => {
            adapter._generateRequestId = () => 'test-id';

            const resultPromise = adapter.confirm({ message: 'Test?' });

            // Wait for prompt to be registered
            await new Promise(resolve => setTimeout(resolve, 10));

            // Handle the response
            adapter.handleResponse('test-id', true);

            const result = await resultPromise;
            expect(result).toBe(true);
        });

        it('should ignore responses for unknown requestIds', () => {
            // Should not throw
            expect(() => {
                adapter.handleResponse('unknown-id', true);
            }).not.toThrow();
        });
    });

    describe('promptForResolution()', () => {
        it('should output prompt in IPC format', async () => {
            adapter._generateRequestId = () => 'test-id';

            const check = {
                name: 'docker_running',
                status: 'failed',
                message: 'Docker not running',
                canResolve: true,
                resolution: {
                    type: 'start_docker',
                    prompt: 'Start Docker Desktop?'
                }
            };

            const resultPromise = adapter.promptForResolution(check);

            await new Promise(resolve => setTimeout(resolve, 10));

            const output = mockStdout.mock.calls[0][0];
            expect(output).toContain('prompt_request');
            expect(output).toContain('Start Docker Desktop?');

            // Resolve to complete the test
            adapter.handleResponse('test-id', true);
            await resultPromise;
        });
    });
});

describe('IPC Protocol Format', () => {
    describe('prompt_request format', () => {
        it('should match expected IPC protocol for confirm prompts', () => {
            const adapter = new IpcPromptAdapter();
            const output = adapter._formatIpcOutput('prompt_request', {
                requestId: 'prompt-1234',
                prompt: {
                    type: 'confirm',
                    message: 'Docker is not running. Start Docker Desktop?',
                    default: true
                }
            });

            const parsed = JSON.parse(output.trim());

            expect(parsed).toEqual({
                frigg_ipc: 'prompt_request',
                requestId: 'prompt-1234',
                prompt: {
                    type: 'confirm',
                    message: 'Docker is not running. Start Docker Desktop?',
                    default: true
                }
            });
        });

        it('should match expected IPC protocol for select prompts', () => {
            const adapter = new IpcPromptAdapter();
            const output = adapter._formatIpcOutput('prompt_request', {
                requestId: 'prompt-5678',
                prompt: {
                    type: 'select',
                    message: 'Choose an action:',
                    choices: [
                        { value: 'start', name: 'Start services' },
                        { value: 'skip', name: 'Skip' }
                    ]
                }
            });

            const parsed = JSON.parse(output.trim());

            expect(parsed.frigg_ipc).toBe('prompt_request');
            expect(parsed.prompt.type).toBe('select');
            expect(parsed.prompt.choices).toHaveLength(2);
        });
    });

    describe('prompt_response format', () => {
        it('should parse prompt_response messages correctly', () => {
            const adapter = new IpcPromptAdapter();
            const response = JSON.stringify({
                frigg_ipc: 'prompt_response',
                requestId: 'prompt-1234',
                response: true
            });

            const parsed = adapter._parseIpcMessage(response);

            expect(parsed.type).toBe('prompt_response');
            expect(parsed.requestId).toBe('prompt-1234');
            expect(parsed.response).toBe(true);
        });
    });
});
