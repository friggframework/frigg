#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const chalk = require('chalk');

const CLI_PATH = path.join(__dirname, '../index.js');

// Test configuration
const TESTS = [
    // Basic help commands
    { name: 'No arguments', cmd: [], expectExit: 0, expectOutput: 'Usage: frigg' },
    { name: 'Help flag', cmd: ['--help'], expectExit: 0, expectOutput: 'Usage: frigg' },
    { name: 'Help short flag', cmd: ['-h'], expectExit: 0, expectOutput: 'Usage: frigg' },
    
    // Help command variations
    { name: 'Help command', cmd: ['help'], expectExit: 0, expectOutput: 'Usage: frigg' },
    { name: 'Help verbose', cmd: ['help', '--verbose'], expectExit: 0, expectOutput: 'Getting Started' },
    { name: 'Help verbose short', cmd: ['help', '-v'], expectExit: 0, expectOutput: 'Getting Started' },
    
    // Interactive mode (only through help command now)
    { name: 'Help interactive', cmd: ['help', '--interactive'], expectExit: null, skipOutput: true, timeout: 100 },
    { name: 'Help interactive short', cmd: ['help', '-i'], expectExit: null, skipOutput: true, timeout: 100 },
    
    // Command help
    { name: 'Init help', cmd: ['init', '--help'], expectExit: 0, expectOutput: 'Create a new Frigg' },
    { name: 'UI help', cmd: ['ui', '--help'], expectExit: 0, expectOutput: 'Launch Frigg Management UI' },
    { name: 'Install help', cmd: ['install', '--help'], expectExit: 0, expectOutput: 'Install an API module' },
    { name: 'Repos help', cmd: ['repos', '--help'], expectExit: 0, expectOutput: 'Manage and discover' },
    { name: 'Playground help', cmd: ['playground', '--help'], expectExit: 0, expectOutput: 'falcon animations' },
    
    // Version
    { name: 'Version flag', cmd: ['--version'], expectExit: 0, expectOutput: '2.0.0-next.0' },
    { name: 'Version short flag', cmd: ['-V'], expectExit: 0, expectOutput: '2.0.0-next.0' },
    
    // Invalid commands
    { name: 'Invalid command', cmd: ['invalid-command'], expectExit: 1, expectError: true },
    
    // Repos command variations
    { name: 'Repos list', cmd: ['repos', 'list'], expectExit: 0 },
    { name: 'Repos current', cmd: ['repos', 'current'], expectExit: 0 },
    
    // Playground variations
    { name: 'Playground list', cmd: ['playground', '--list'], expectExit: 0, expectOutput: 'Available Animations' },
    
    // Test that -i doesn't interfere with commands anymore
    { name: 'Init with project name', cmd: ['init', 'test-project', '--no-frontend'], expectExit: null, timeout: 1000 },
    { name: 'UI with port', cmd: ['ui', '--port', '3002'], expectExit: null, timeout: 1000 },
];

// Test runner
async function runTest(test) {
    return new Promise((resolve) => {
        const child = spawn('node', [CLI_PATH, ...test.cmd], {
            timeout: test.timeout || 5000,
            env: { ...process.env, NO_UPDATE_CHECK: '1' } // Disable update check for tests
        });
        
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        // Handle timeout for interactive commands
        if (test.timeout) {
            setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
            }, test.timeout);
        }
        
        child.on('exit', (code) => {
            const output = stdout + stderr;
            
            // Check exit code
            const exitOk = test.expectExit === null || code === test.expectExit;
            
            // Check output
            let outputOk = true;
            if (!test.skipOutput && test.expectOutput) {
                outputOk = output.includes(test.expectOutput);
            }
            
            // Check for unexpected errors
            const hasUnexpectedError = !test.expectError && stderr.length > 0 && !timedOut;
            
            resolve({
                name: test.name,
                success: exitOk && outputOk && !hasUnexpectedError,
                exitCode: code,
                expectedExit: test.expectExit,
                output: output.substring(0, 200), // First 200 chars
                error: stderr,
                timedOut,
                outputOk,
                exitOk,
                hasUnexpectedError
            });
        });
    });
}

// Main test execution
async function runAllTests() {
    console.log(chalk.bold.cyan('\n🧪 Frigg CLI Test Suite\n'));
    console.log(chalk.gray('Testing all command variations...\n'));
    
    const results = [];
    let passed = 0;
    let failed = 0;
    
    for (const test of TESTS) {
        process.stdout.write(chalk.gray(`Running: ${test.name.padEnd(30)} `));
        
        const result = await runTest(test);
        results.push(result);
        
        if (result.success) {
            console.log(chalk.green('✓ PASS'));
            passed++;
        } else {
            console.log(chalk.red('✗ FAIL'));
            failed++;
            
            // Show failure details
            if (!result.exitOk) {
                console.log(chalk.red(`  Exit code: ${result.exitCode} (expected ${result.expectedExit})`));
            }
            if (!result.outputOk) {
                console.log(chalk.red(`  Missing expected output: "${test.expectOutput}"`));
            }
            if (result.hasUnexpectedError) {
                console.log(chalk.red(`  Unexpected error: ${result.error}`));
            }
            if (result.output && failed <= 5) { // Show output for first 5 failures
                console.log(chalk.gray(`  Output: ${result.output.replace(/\n/g, ' ')}`));
            }
        }
    }
    
    // Summary
    console.log(chalk.bold('\n📊 Test Summary\n'));
    console.log(chalk.green(`  Passed: ${passed}`));
    console.log(chalk.red(`  Failed: ${failed}`));
    console.log(chalk.cyan(`  Total:  ${TESTS.length}`));
    
    if (failed > 0) {
        console.log(chalk.red('\n❌ Some tests failed!\n'));
        process.exit(1);
    } else {
        console.log(chalk.green('\n✅ All tests passed!\n'));
    }
}

// Run tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { runTest, TESTS };