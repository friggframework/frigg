const { Command } = require('commander');

/**
 * CommandTester - Utility class for testing CLI commands
 * Provides a fluent interface for setting up mocks and executing commands
 */
class CommandTester {
  constructor(commandDefinition) {
    this.commandDefinition = commandDefinition;
    this.mocks = new Map();
    this.originalEnv = process.env;
    this.capturedLogs = {
      info: [],
      error: [],
      debug: [],
      warn: []
    };
  }

  /**
   * Set up a mock for a module
   * @param {string} modulePath - Path to the module to mock
   * @param {object} implementation - Mock implementation
   * @returns {CommandTester} - Fluent interface
   */
  mock(modulePath, implementation) {
    this.mocks.set(modulePath, implementation);
    return this;
  }

  /**
   * Set environment variables for the test
   * @param {object} env - Environment variables to set
   * @returns {CommandTester} - Fluent interface
   */
  withEnv(env) {
    process.env = { ...process.env, ...env };
    return this;
  }

  /**
   * Capture console output during test execution
   * @returns {CommandTester} - Fluent interface
   */
  captureOutput() {
    const originalConsole = { ...console };
    
    console.log = (...args) => {
      this.capturedLogs.info.push(args.join(' '));
      originalConsole.log(...args);
    };
    
    console.error = (...args) => {
      this.capturedLogs.error.push(args.join(' '));
      originalConsole.error(...args);
    };
    
    console.warn = (...args) => {
      this.capturedLogs.warn.push(args.join(' '));
      originalConsole.warn(...args);
    };
    
    console.debug = (...args) => {
      this.capturedLogs.debug.push(args.join(' '));
      originalConsole.debug(...args);
    };
    
    return this;
  }

  /**
   * Execute the command with given arguments
   * @param {string[]} args - Command arguments
   * @param {object} options - Command options
   * @returns {Promise<object>} - Execution result
   */
  async execute(args = [], options = {}) {
    // Set up mocks
    for (const [path, impl] of this.mocks) {
      jest.mock(path, () => impl, { virtual: true });
    }

    try {
      const program = new Command();
      
      // Set up the command
      const cmd = program
        .command(this.commandDefinition.name)
        .description(this.commandDefinition.description);
      
      // Add options if defined
      if (this.commandDefinition.options) {
        this.commandDefinition.options.forEach(option => {
          cmd.option(option.flags, option.description, option.defaultValue);
        });
      }
      
      // Add action
      cmd.action(this.commandDefinition.action);
      
      // Mock process.exit to prevent actual exit
      const originalExit = process.exit;
      let exitCode = 0;
      process.exit = (code) => {
        exitCode = code;
        throw new Error(`Process exited with code ${code}`);
      };
      
      try {
        await program.parseAsync(['node', 'cli', ...args]);
        
        return {
          success: true,
          exitCode: 0,
          logs: this.capturedLogs,
          args,
          options
        };
      } catch (error) {
        if (error.message.includes('Process exited with code')) {
          return {
            success: false,
            exitCode,
            error: error.message,
            logs: this.capturedLogs,
            args,
            options
          };
        }
        throw error;
      } finally {
        process.exit = originalExit;
      }
    } finally {
      // Clean up mocks
      for (const [path] of this.mocks) {
        jest.unmock(path);
      }
      
      // Restore environment
      process.env = this.originalEnv;
    }
  }

  /**
   * Get captured logs
   * @returns {object} - Captured logs by type
   */
  getLogs() {
    return this.capturedLogs;
  }

  /**
   * Reset the tester state
   * @returns {CommandTester} - Fluent interface
   */
  reset() {
    this.mocks.clear();
    this.capturedLogs = {
      info: [],
      error: [],
      debug: [],
      warn: []
    };
    process.env = this.originalEnv;
    return this;
  }
}

module.exports = { CommandTester };