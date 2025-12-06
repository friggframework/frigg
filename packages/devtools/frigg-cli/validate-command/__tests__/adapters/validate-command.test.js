const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    createValidateCommand,
    formatConsoleOutput,
    autoDetectFriggApp,
    findBackendPathInDir,
    findBackendPath
} = require('../../adapters/cli/validate-command');
const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');
const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');
const { Command } = require('commander');

describe('validateCommand', () => {
    let mockOutput;

    beforeEach(() => {
        mockOutput = {
            info: jest.fn(),
            success: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            log: jest.fn()
        };
    });

    describe('createValidateCommand', () => {
        it('registers validate command on program', () => {
            const program = new Command();
            createValidateCommand(program);
            const validateCmd = program.commands.find(c => c.name() === 'validate');
            expect(validateCmd).toBeDefined();
        });

        it('has required options', () => {
            const program = new Command();
            createValidateCommand(program);
            const validateCmd = program.commands.find(c => c.name() === 'validate');
            const options = validateCmd.options.map(o => o.long);
            expect(options).toContain('--format');
            expect(options).toContain('--verbose');
        });
    });

    describe('formatConsoleOutput', () => {
        it('outputs success for valid result', () => {
            const result = ValidationResult.create();
            formatConsoleOutput(result, {}, mockOutput);
            expect(mockOutput.success).toHaveBeenCalled();
        });

        it('outputs errors for invalid result', () => {
            const error = ValidationError.create({
                path: 'integrations',
                message: 'Missing integrations',
                severity: 'error'
            });
            const result = ValidationResult.create({ errors: [error] });
            formatConsoleOutput(result, {}, mockOutput);
            const logCalls = mockOutput.log.mock.calls.flat().join(' ');
            expect(logCalls).toContain('Missing integrations');
        });

        it('outputs warnings', () => {
            const warning = ValidationError.create({
                path: 'database',
                message: 'No database configured',
                severity: 'warning'
            });
            const result = ValidationResult.create({ errors: [warning] });
            formatConsoleOutput(result, {}, mockOutput);
            expect(mockOutput.warn).toHaveBeenCalled();
        });

        it('shows fix suggestions in verbose mode', () => {
            const fix = FixSuggestion.create({ action: 'add', description: 'Add database configuration' });
            const error = ValidationError.create({
                path: 'database',
                message: 'Missing config',
                severity: 'error',
                fix
            });
            const result = ValidationResult.create({ errors: [error] });
            formatConsoleOutput(result, { verbose: true }, mockOutput);
            const logCalls = mockOutput.log.mock.calls.flat().join(' ');
            expect(logCalls).toContain('Add database configuration');
        });
    });

    describe('findBackendPathInDir', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('finds backend/index.js', () => {
            const backendDir = path.join(tmpDir, 'backend');
            fs.mkdirSync(backendDir);
            fs.writeFileSync(path.join(backendDir, 'index.js'), 'module.exports = {}');
            expect(findBackendPathInDir(tmpDir)).toBe(backendDir);
        });

        it('finds index.js with integrations keyword', () => {
            fs.writeFileSync(path.join(tmpDir, 'index.js'), 'module.exports = { integrations: [] }');
            expect(findBackendPathInDir(tmpDir)).toBe(tmpDir);
        });

        it('finds index.js with Definition keyword', () => {
            fs.writeFileSync(path.join(tmpDir, 'index.js'), 'module.exports = { Definition: {} }');
            expect(findBackendPathInDir(tmpDir)).toBe(tmpDir);
        });

        it('returns null for non-frigg directory', () => {
            fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello")');
            expect(findBackendPathInDir(tmpDir)).toBeNull();
        });

        it('returns null for empty directory', () => {
            expect(findBackendPathInDir(tmpDir)).toBeNull();
        });
    });

    describe('findBackendPath', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('finds backend subdirectory with package.json', () => {
            const backendDir = path.join(tmpDir, 'backend');
            fs.mkdirSync(backendDir);
            fs.writeFileSync(path.join(backendDir, 'package.json'), '{}');
            expect(findBackendPath(tmpDir)).toBe(backendDir);
        });

        it('finds backend subdirectory with index.js', () => {
            const backendDir = path.join(tmpDir, 'backend');
            fs.mkdirSync(backendDir);
            fs.writeFileSync(path.join(backendDir, 'index.js'), 'module.exports = {}');
            expect(findBackendPath(tmpDir)).toBe(backendDir);
        });

        it('returns path itself if it has package.json', () => {
            fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
            expect(findBackendPath(tmpDir)).toBe(tmpDir);
        });

        it('returns null for non-backend directory', () => {
            expect(findBackendPath(tmpDir)).toBeNull();
        });
    });

    describe('autoDetectFriggApp', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('detects frigg app in current directory', () => {
            const backendDir = path.join(tmpDir, 'backend');
            fs.mkdirSync(backendDir);
            fs.writeFileSync(path.join(backendDir, 'index.js'), 'module.exports = {}');
            const result = autoDetectFriggApp(tmpDir);
            expect(result).toEqual({
                appRoot: tmpDir,
                backendPath: backendDir
            });
        });

        it('detects frigg app in parent directory', () => {
            const backendDir = path.join(tmpDir, 'backend');
            const subDir = path.join(tmpDir, 'src', 'components');
            fs.mkdirSync(backendDir);
            fs.mkdirSync(subDir, { recursive: true });
            fs.writeFileSync(path.join(backendDir, 'index.js'), 'module.exports = {}');
            const result = autoDetectFriggApp(subDir);
            expect(result).toEqual({
                appRoot: tmpDir,
                backendPath: backendDir
            });
        });

        it('returns null when no frigg app found', () => {
            const result = autoDetectFriggApp(tmpDir);
            expect(result).toBeNull();
        });
    });
});
