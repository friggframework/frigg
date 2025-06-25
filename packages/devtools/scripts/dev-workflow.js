#!/usr/bin/env node

/**
 * Development Workflow Manager
 * 
 * Manages development workflows for Phase 1 components:
 * - Concurrent development servers
 * - Test automation
 * - Build processes
 * - Quality checks
 */

const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { program } = require('commander');

const WORKFLOW_CONFIG = {
  ROOT_DIR: path.join(__dirname, '../../..'),
  CLI_DIR: path.join(__dirname, '../frigg-cli'),
  UI_DIR: path.join(__dirname, '../management-ui'),
  TEST_DIR: path.join(__dirname, '../integration-tests'),
  PORTS: {
    UI: 3001,
    API: 3000,
    DEV_SERVER: 5173
  }
};

/**
 * Active process tracking
 */
const activeProcesses = new Map();

/**
 * CLI Commands
 */
program
  .name('dev-workflow')
  .description('Frigg Phase 1 Development Workflow Manager')
  .version('1.0.0');

program
  .command('start')
  .description('Start all development servers')
  .option('-w, --watch', 'enable watch mode')
  .option('-t, --test', 'run tests in watch mode')
  .action(startDevelopment);

program
  .command('stop')
  .description('Stop all development servers')
  .action(stopDevelopment);

program
  .command('test')
  .description('Run all tests')
  .option('-i, --integration', 'run integration tests only')
  .option('-p, --performance', 'run performance tests only')
  .option('-r, --rfc', 'run RFC validation tests only')
  .option('-w, --watch', 'run in watch mode')
  .action(runTests);

program
  .command('build')
  .description('Build all components')
  .option('-p, --production', 'production build')
  .action(buildComponents);

program
  .command('lint')
  .description('Run linting and formatting')
  .option('-f, --fix', 'auto-fix issues')
  .action(runLinting);

program
  .command('status')
  .description('Show development server status')
  .action(showStatus);

program
  .command('logs')
  .description('Show development logs')
  .option('-f, --follow', 'follow logs')
  .option('-c, --component <name>', 'show logs for specific component')
  .action(showLogs);

/**
 * Start development environment
 */
async function startDevelopment(options) {
  console.log(chalk.blue('🚀 Starting Frigg Development Environment'));
  console.log();
  
  try {
    // Check if ports are available
    await checkPorts();
    
    // Start UI development server
    await startUIServer(options.watch);
    
    // Start API server (if separate)
    await startAPIServer();
    
    // Start test watcher if requested
    if (options.test) {
      await startTestWatcher();
    }
    
    // Start file watcher for CLI
    if (options.watch) {
      await startCLIWatcher();
    }
    
    console.log(chalk.green('✅ Development environment started'));
    showDevelopmentInfo();
    
    // Keep process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start development environment:'), error.message);
    await stopDevelopment();
    process.exit(1);
  }
}

/**
 * Stop development environment
 */
async function stopDevelopment() {
  console.log(chalk.yellow('🛑 Stopping development servers...'));
  
  for (const [name, process] of activeProcesses) {
    console.log(`Stopping ${name}...`);
    process.kill();
  }
  
  activeProcesses.clear();
  console.log(chalk.green('✅ All servers stopped'));
}

/**
 * Run tests
 */
async function runTests(options) {
  console.log(chalk.blue('🧪 Running tests...'));
  
  const testArgs = ['test'];
  
  if (options.integration) {
    testArgs.push('cli-gui-integration.test.js');
  } else if (options.performance) {
    testArgs.push('performance.test.js');
  } else if (options.rfc) {
    testArgs.push('rfc-validation.test.js');
  }
  
  if (options.watch) {
    testArgs.push('--watch');
  }
  
  try {
    await runCommand('npm', testArgs, WORKFLOW_CONFIG.TEST_DIR);
    console.log(chalk.green('✅ Tests completed'));
  } catch (error) {
    console.error(chalk.red('❌ Tests failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Build all components
 */
async function buildComponents(options) {
  console.log(chalk.blue('🔨 Building components...'));
  
  try {
    // Build Management UI
    console.log('Building Management UI...');
    const buildArgs = options.production ? ['run', 'build'] : ['run', 'build:dev'];
    await runCommand('npm', buildArgs, WORKFLOW_CONFIG.UI_DIR);
    console.log(chalk.green('✓ Management UI built'));
    
    // Build CLI (if needed)
    console.log('Preparing CLI...');
    await runCommand('npm', ['run', 'prepare'], WORKFLOW_CONFIG.CLI_DIR);
    console.log(chalk.green('✓ CLI prepared'));
    
    console.log(chalk.green('✅ All components built'));
    
  } catch (error) {
    console.error(chalk.red('❌ Build failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Run linting and formatting
 */
async function runLinting(options) {
  console.log(chalk.blue('🔍 Running linting and formatting...'));
  
  try {
    const lintArgs = ['run', 'lint'];
    if (options.fix) {
      lintArgs.push('--', '--fix');
    }
    
    // Lint CLI
    await runCommand('npm', lintArgs, WORKFLOW_CONFIG.CLI_DIR);
    console.log(chalk.green('✓ CLI linted'));
    
    // Lint UI
    await runCommand('npm', lintArgs, WORKFLOW_CONFIG.UI_DIR);
    console.log(chalk.green('✓ UI linted'));
    
    console.log(chalk.green('✅ Linting completed'));
    
  } catch (error) {
    console.error(chalk.red('❌ Linting failed:'), error.message);
    process.exit(1);
  }
}

/**
 * Show development server status
 */
async function showStatus() {
  console.log(chalk.blue('📊 Development Server Status'));
  console.log();
  
  const ports = [
    { name: 'Management UI', port: WORKFLOW_CONFIG.PORTS.UI },
    { name: 'API Server', port: WORKFLOW_CONFIG.PORTS.API },
    { name: 'Dev Server', port: WORKFLOW_CONFIG.PORTS.DEV_SERVER }
  ];
  
  for (const { name, port } of ports) {
    const status = await checkPortStatus(port);
    const statusColor = status ? chalk.green : chalk.red;
    const statusText = status ? 'RUNNING' : 'STOPPED';
    console.log(`${name.padEnd(15)} ${statusColor(statusText.padEnd(10))} http://localhost:${port}`);
  }
  
  console.log();
  console.log(`Active processes: ${activeProcesses.size}`);
  
  if (activeProcesses.size > 0) {
    console.log('Running:');
    for (const name of activeProcesses.keys()) {
      console.log(`  - ${name}`);
    }
  }
}

/**
 * Show development logs
 */
async function showLogs(options) {
  console.log(chalk.blue('📄 Development Logs'));
  console.log();
  
  const logsDir = path.join(WORKFLOW_CONFIG.ROOT_DIR, 'logs');
  
  if (!await fs.pathExists(logsDir)) {
    console.log(chalk.yellow('No logs directory found'));
    return;
  }
  
  const logFiles = await fs.readdir(logsDir);
  
  if (logFiles.length === 0) {
    console.log(chalk.yellow('No log files found'));
    return;
  }
  
  if (options.component) {
    const componentLog = logFiles.find(file => file.includes(options.component));
    if (componentLog) {
      await showLogFile(path.join(logsDir, componentLog), options.follow);
    } else {
      console.log(chalk.red(`No logs found for component: ${options.component}`));
    }
  } else {
    console.log('Available log files:');
    logFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
  }
}

/**
 * Helper Functions
 */

/**
 * Start UI development server
 */
async function startUIServer(watch = false) {
  console.log(chalk.yellow('Starting Management UI server...'));
  
  const args = watch ? ['run', 'dev'] : ['run', 'build:dev'];
  const uiProcess = spawn('npm', args, {
    cwd: WORKFLOW_CONFIG.UI_DIR,
    stdio: 'pipe'
  });
  
  activeProcesses.set('Management UI', uiProcess);
  
  // Log output
  uiProcess.stdout.on('data', (data) => {
    logToFile('ui', data.toString());
  });
  
  uiProcess.stderr.on('data', (data) => {
    logToFile('ui', data.toString());
  });
  
  // Wait for server to be ready
  await waitForPort(WORKFLOW_CONFIG.PORTS.DEV_SERVER);
  console.log(chalk.green(`✓ Management UI server started on http://localhost:${WORKFLOW_CONFIG.PORTS.DEV_SERVER}`));
}

/**
 * Start API server
 */
async function startAPIServer() {
  console.log(chalk.yellow('Starting API server...'));
  
  const apiProcess = spawn('node', [
    path.join(WORKFLOW_CONFIG.CLI_DIR, 'index.js'),
    'ui',
    '--no-browser',
    '--port',
    WORKFLOW_CONFIG.PORTS.UI.toString()
  ], {
    stdio: 'pipe'
  });
  
  activeProcesses.set('API Server', apiProcess);
  
  // Log output
  apiProcess.stdout.on('data', (data) => {
    logToFile('api', data.toString());
  });
  
  apiProcess.stderr.on('data', (data) => {
    logToFile('api', data.toString());
  });
  
  // Wait for server to be ready
  await waitForPort(WORKFLOW_CONFIG.PORTS.UI);
  console.log(chalk.green(`✓ API server started on http://localhost:${WORKFLOW_CONFIG.PORTS.UI}`));
}

/**
 * Start test watcher
 */
async function startTestWatcher() {
  console.log(chalk.yellow('Starting test watcher...'));
  
  const testProcess = spawn('npm', ['run', 'test:watch'], {
    cwd: WORKFLOW_CONFIG.TEST_DIR,
    stdio: 'pipe'
  });
  
  activeProcesses.set('Test Watcher', testProcess);
  
  testProcess.stdout.on('data', (data) => {
    logToFile('tests', data.toString());
  });
  
  console.log(chalk.green('✓ Test watcher started'));
}

/**
 * Start CLI file watcher
 */
async function startCLIWatcher() {
  console.log(chalk.yellow('Starting CLI file watcher...'));
  
  const fs = require('fs');
  const chokidar = require('chokidar');
  
  const watcher = chokidar.watch(path.join(WORKFLOW_CONFIG.CLI_DIR, '**/*.js'), {
    ignored: /node_modules/,
    persistent: true
  });
  
  watcher.on('change', (filePath) => {
    console.log(chalk.blue(`📝 CLI file changed: ${path.relative(WORKFLOW_CONFIG.CLI_DIR, filePath)}`));
    logToFile('cli', `File changed: ${filePath}\n`);
  });
  
  console.log(chalk.green('✓ CLI file watcher started'));
}

/**
 * Check if ports are available
 */
async function checkPorts() {
  const portsToCheck = Object.values(WORKFLOW_CONFIG.PORTS);
  
  for (const port of portsToCheck) {
    if (await checkPortStatus(port)) {
      throw new Error(`Port ${port} is already in use`);
    }
  }
}

/**
 * Check if port is in use
 */
function checkPortStatus(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(false); // Port is available
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(true); // Port is in use
    });
  });
}

/**
 * Wait for port to be available
 */
async function waitForPort(port, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkPortStatus(port)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Port ${port} did not become available`);
}

/**
 * Log to file
 */
async function logToFile(component, data) {
  const logsDir = path.join(WORKFLOW_CONFIG.ROOT_DIR, 'logs');
  await fs.ensureDir(logsDir);
  
  const logFile = path.join(logsDir, `${component}.log`);
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${data}`;
  
  await fs.appendFile(logFile, logEntry);
}

/**
 * Show log file contents
 */
async function showLogFile(filePath, follow = false) {
  if (follow) {
    // Follow mode - use tail -f equivalent
    const tailProcess = spawn('tail', ['-f', filePath], { stdio: 'inherit' });
    activeProcesses.set(`Logs: ${path.basename(filePath)}`, tailProcess);
  } else {
    // Show recent logs
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').slice(-50); // Last 50 lines
    console.log(lines.join('\n'));
  }
}

/**
 * Run command with proper error handling
 */
function runCommand(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Show development environment information
 */
function showDevelopmentInfo() {
  console.log();
  console.log(chalk.blue('🎯 Development Environment Ready'));
  console.log();
  console.log('Available services:');
  console.log(`  Management UI:  ${chalk.cyan(`http://localhost:${WORKFLOW_CONFIG.PORTS.DEV_SERVER}`)}`);
  console.log(`  API Server:     ${chalk.cyan(`http://localhost:${WORKFLOW_CONFIG.PORTS.UI}`)}`);
  console.log();
  console.log('Useful commands:');
  console.log(`  ${chalk.cyan('npm run dev:status')}     - Show server status`);
  console.log(`  ${chalk.cyan('npm run dev:logs')}       - Show development logs`);
  console.log(`  ${chalk.cyan('npm run dev:test')}       - Run tests`);
  console.log(`  ${chalk.cyan('npm run dev:stop')}       - Stop all servers`);
  console.log();
  console.log(`${chalk.gray('Press Ctrl+C to stop all servers')}`);
}

/**
 * Cleanup on exit
 */
process.on('SIGINT', async () => {
  console.log();
  await stopDevelopment();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopDevelopment();
  process.exit(0);
});

// Parse CLI arguments
if (require.main === module) {
  program.parse();
}

module.exports = {
  startDevelopment,
  stopDevelopment,
  runTests,
  buildComponents,
  runLinting,
  showStatus,
  showLogs
};