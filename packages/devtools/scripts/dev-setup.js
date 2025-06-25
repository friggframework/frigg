#!/usr/bin/env node

/**
 * Development Setup Script
 * 
 * Sets up the development environment for Phase 1 components:
 * - CLI development
 * - Management UI development
 * - Integration testing
 */

const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const SCRIPT_CONFIG = {
  ROOT_DIR: path.join(__dirname, '../../..'),
  CLI_DIR: path.join(__dirname, '../frigg-cli'),
  UI_DIR: path.join(__dirname, '../management-ui'),
  TEST_DIR: path.join(__dirname, '../integration-tests')
};

/**
 * Main setup function
 */
async function setupDevelopment() {
  console.log(chalk.blue('🚀 Setting up Frigg Phase 1 Development Environment'));
  console.log();
  
  try {
    // Check prerequisites
    await checkPrerequisites();
    
    // Install dependencies
    await installDependencies();
    
    // Setup development databases/state
    await setupDevEnvironment();
    
    // Run initial tests
    await runInitialTests();
    
    // Display next steps
    displayNextSteps();
    
  } catch (error) {
    console.error(chalk.red('❌ Setup failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Check prerequisites
 */
async function checkPrerequisites() {
  console.log(chalk.yellow('📋 Checking prerequisites...'));
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1));
  
  if (majorVersion < 18) {
    throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
  }
  
  console.log(chalk.green(`✓ Node.js ${nodeVersion}`));
  
  // Check npm
  try {
    await runCommand('npm', ['--version']);
    console.log(chalk.green('✓ npm available'));
  } catch (error) {
    throw new Error('npm not available');
  }
  
  // Check git
  try {
    await runCommand('git', ['--version']);
    console.log(chalk.green('✓ git available'));
  } catch (error) {
    console.log(chalk.yellow('⚠ git not available (optional)'));
  }
  
  console.log();
}

/**
 * Install dependencies
 */
async function installDependencies() {
  console.log(chalk.yellow('📦 Installing dependencies...'));
  
  // Install root dependencies
  console.log('Installing root dependencies...');
  await runCommand('npm', ['install'], SCRIPT_CONFIG.ROOT_DIR);
  
  // Install CLI dependencies
  console.log('Installing CLI dependencies...');
  await runCommand('npm', ['install'], SCRIPT_CONFIG.CLI_DIR);
  
  // Install UI dependencies
  console.log('Installing UI dependencies...');
  await runCommand('npm', ['install'], SCRIPT_CONFIG.UI_DIR);
  
  // Install integration test dependencies
  console.log('Installing integration test dependencies...');
  await runCommand('npm', ['install'], SCRIPT_CONFIG.TEST_DIR);
  
  console.log(chalk.green('✓ All dependencies installed'));
  console.log();
}

/**
 * Setup development environment
 */
async function setupDevEnvironment() {
  console.log(chalk.yellow('🔧 Setting up development environment...'));
  
  // Create .env file for development
  const envPath = path.join(SCRIPT_CONFIG.ROOT_DIR, '.env.development');
  const envContent = `
# Frigg Development Environment
NODE_ENV=development
LOG_LEVEL=debug
UI_PORT=3001
API_PORT=3000

# Development flags
ENABLE_DEBUG=true
MOCK_INTEGRATIONS=true
`;
  
  await fs.writeFile(envPath, envContent.trim());
  console.log(chalk.green('✓ Development .env created'));
  
  // Create logs directory
  const logsDir = path.join(SCRIPT_CONFIG.ROOT_DIR, 'logs');
  await fs.ensureDir(logsDir);
  console.log(chalk.green('✓ Logs directory created'));
  
  // Create temp directory for tests
  const tempDir = path.join(SCRIPT_CONFIG.ROOT_DIR, 'temp');
  await fs.ensureDir(tempDir);
  console.log(chalk.green('✓ Temp directory created'));
  
  console.log();
}

/**
 * Run initial tests
 */
async function runInitialTests() {
  console.log(chalk.yellow('🧪 Running initial tests...'));
  
  try {
    // Run CLI tests
    console.log('Testing CLI functionality...');
    await runCommand('node', [path.join(SCRIPT_CONFIG.CLI_DIR, 'index.js'), '--help']);
    console.log(chalk.green('✓ CLI working'));
    
    // Build UI
    console.log('Building Management UI...');
    await runCommand('npm', ['run', 'build'], SCRIPT_CONFIG.UI_DIR);
    console.log(chalk.green('✓ UI builds successfully'));
    
    // Run integration tests (quick smoke test)
    console.log('Running smoke tests...');
    process.env.QUICK_TEST = 'true';
    await runCommand('npm', ['test', '--', '--testNamePattern="CLI Commands"'], SCRIPT_CONFIG.TEST_DIR);
    console.log(chalk.green('✓ Smoke tests passed'));
    
  } catch (error) {
    console.log(chalk.yellow('⚠ Some tests failed - this is normal during development'));
    console.log(chalk.gray(`Error: ${error.message}`));
  }
  
  console.log();
}

/**
 * Display next steps
 */
function displayNextSteps() {
  console.log(chalk.green('🎉 Development environment setup complete!'));
  console.log();
  console.log(chalk.blue('Next steps:'));
  console.log();
  console.log('1. Start development servers:');
  console.log(chalk.cyan('   npm run dev'));
  console.log();
  console.log('2. Run tests:');
  console.log(chalk.cyan('   npm run test:integration'));
  console.log(chalk.cyan('   npm run test:performance'));
  console.log(chalk.cyan('   npm run test:rfc'));
  console.log();
  console.log('3. Test CLI commands:');
  console.log(chalk.cyan('   node packages/devtools/frigg-cli/index.js init test-project'));
  console.log(chalk.cyan('   node packages/devtools/frigg-cli/index.js ui'));
  console.log();
  console.log('4. Development workflow:');
  console.log(chalk.cyan('   npm run dev:watch    # Watch mode'));
  console.log(chalk.cyan('   npm run test:watch   # Test watch mode'));
  console.log();
  console.log(chalk.blue('Documentation:'));
  console.log(chalk.cyan('   docs/guides/development.md'));
  console.log(chalk.cyan('   rfcs/0001-frigg-cli-migration.md'));
  console.log();
}

/**
 * Run command with proper error handling
 */
function runCommand(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Run setup if called directly
if (require.main === module) {
  setupDevelopment().catch((error) => {
    console.error(chalk.red('Setup failed:'), error);
    process.exit(1);
  });
}

module.exports = { setupDevelopment };