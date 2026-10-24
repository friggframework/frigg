const chalk = require('chalk');
const { spawn } = require('child_process');
const readline = require('readline');

class ProcessManager {
    constructor() {
        this.processes = new Map();
        this.isShuttingDown = false;
        this.outputBuffer = new Map();
        this.setupShutdownHandlers();
    }

    setupShutdownHandlers() {
        const shutdown = async () => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            console.log('\n' + chalk.yellow('⏹  Shutting down...'));
            
            const shutdownPromises = [];
            for (const [name, proc] of this.processes) {
                shutdownPromises.push(this.killProcess(name, proc));
            }

            await Promise.all(shutdownPromises);
            
            console.log(chalk.green('✓ All processes stopped cleanly'));
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('exit', () => {
            for (const [, proc] of this.processes) {
                try {
                    proc.kill('SIGKILL');
                } catch (e) {
                    // Process already dead
                }
            }
        });
    }

    async killProcess(name, proc) {
        return new Promise((resolve) => {
            if (!proc || proc.killed) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                } catch (e) {
                    // Process already dead
                }
                resolve();
            }, 5000);

            proc.once('exit', () => {
                clearTimeout(timeout);
                this.processes.delete(name);
                resolve();
            });

            try {
                proc.kill('SIGTERM');
            } catch (e) {
                clearTimeout(timeout);
                resolve();
            }
        });
    }

    spawnProcess(name, command, args, options = {}) {
        const proc = spawn(command, args, {
            ...options,
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });

        this.processes.set(name, proc);
        this.outputBuffer.set(name, []);

        // Create readline interfaces for better line handling
        const stdoutReader = readline.createInterface({
            input: proc.stdout,
            crlfDelay: Infinity
        });

        const stderrReader = readline.createInterface({
            input: proc.stderr,
            crlfDelay: Infinity
        });

        stdoutReader.on('line', (line) => {
            if (!this.isShuttingDown) {
                this.handleOutput(name, line, 'stdout');
            }
        });

        stderrReader.on('line', (line) => {
            if (!this.isShuttingDown) {
                this.handleOutput(name, line, 'stderr');
            }
        });

        proc.on('error', (error) => {
            if (!this.isShuttingDown) {
                console.error(chalk.red(`[${name}] Process error:`), error.message);
            }
        });

        proc.on('exit', (code, signal) => {
            this.processes.delete(name);
            if (!this.isShuttingDown && code !== 0 && code !== null) {
                console.error(chalk.red(`[${name}] Process exited with code ${code}`));
            }
        });

        return proc;
    }

    handleOutput(processName, line, stream) {
        // Filter out noisy/redundant messages
        const filters = [
            /VITE v\d+\.\d+\.\d+/,
            /ready in \d+ ms/,
            /Local:/,
            /Network:/,
            /press h \+ enter to show help/,
            /\[nodemon\]/,
            /watching for file changes/,
            /restarting due to changes/,
            /starting/,
            /clean exit/,
            /waiting for changes before restart/,
            /^$/  // empty lines
        ];

        if (filters.some(filter => filter.test(line))) {
            return;
        }

        // Format output based on process
        const prefix = this.getProcessPrefix(processName);
        const coloredLine = this.colorizeOutput(line, stream);
        
        console.log(`${prefix} ${coloredLine}`);
    }

    getProcessPrefix(processName) {
        const prefixes = {
            'frontend': chalk.blue('[Frontend]'),
            'backend': chalk.green('[Backend]'),
            'vite': chalk.blue('[Vite]'),
            'server': chalk.green('[Server]')
        };

        return prefixes[processName.toLowerCase()] || chalk.gray(`[${processName}]`);
    }

    colorizeOutput(line, stream) {
        // Error detection
        if (stream === 'stderr' || /error|fail|exception/i.test(line)) {
            return chalk.red(line);
        }

        // Warning detection
        if (/warn|warning/i.test(line)) {
            return chalk.yellow(line);
        }

        // Success detection
        if (/success|ready|started|listening|compiled/i.test(line)) {
            return chalk.green(line);
        }

        // Info detection
        if (/info|starting/i.test(line)) {
            return chalk.blue(line);
        }

        return chalk.gray(line);
    }

    printStatus(frontendUrl, backendUrl, repoName) {
        console.log('\n' + chalk.bold.green('✨ Frigg Management UI is ready!'));
        console.log('');
        console.log(chalk.cyan('  Frontend:  ') + chalk.white(frontendUrl));
        console.log(chalk.cyan('  Backend:   ') + chalk.white(backendUrl));
        console.log(chalk.cyan('  Repository:') + chalk.white(` ${repoName}`));
        console.log('');
        console.log(chalk.gray('  Press ' + chalk.bold('Ctrl+C') + ' to stop all servers'));
        console.log('');
    }
}

module.exports = ProcessManager;