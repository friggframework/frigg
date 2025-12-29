/**
 * Output - Unified CLI output and interaction utilities
 *
 * Provides consistent formatting, colors, and interactive prompts across all CLI commands.
 * Replaces direct usage of chalk, console.log, inquirer, and readline.
 *
 * @example
 * const output = require('./utils/output');
 *
 * output.success('Module installed successfully');
 * output.error('Failed to connect to database', error);
 * output.info('Starting deployment...');
 *
 * const spinner = output.spinner('Downloading dependencies...');
 * // do work
 * spinner.succeed('Dependencies downloaded');
 *
 * const answer = await output.prompt({
 *   type: 'confirm',
 *   name: 'continue',
 *   message: 'Continue with installation?'
 * });
 */

const chalk = require('chalk');
const { select, input, confirm, checkbox, password } = require('@inquirer/prompts');

class Output {
  /**
   * Display a success message with a checkmark
   * @param {string} message - Success message to display
   */
  success(message) {
    console.log(chalk.green('✓'), chalk.green(message));
  }

  /**
   * Display an error message with an X mark
   * @param {string} message - Error message to display
   * @param {Error} [error] - Optional error object to display
   */
  error(message, error) {
    console.error(chalk.red('✗'), chalk.red(message));
    if (error && process.env.DEBUG) {
      console.error(chalk.gray(error.stack || error.message));
    }
  }

  /**
   * Display an info message with an info icon
   * @param {string} message - Info message to display
   */
  info(message) {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Display a warning message
   * @param {string} message - Warning message to display
   */
  warn(message) {
    console.warn(chalk.yellow('⚠'), chalk.yellow(message));
  }

  /**
   * Display a debug message (only when DEBUG env var is set)
   * @param {string} message - Debug message to display
   */
  debug(message) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), chalk.gray(message));
    }
  }

  /**
   * Display a header/title
   * @param {string} title - Title to display
   */
  header(title) {
    console.log('');
    console.log(chalk.bold.cyan(title));
    console.log(chalk.cyan('─'.repeat(title.length)));
  }

  /**
   * Display a section separator
   */
  separator() {
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Display a blank line
   */
  newline() {
    console.log('');
  }

  /**
   * Display a table of data
   * @param {Array<Object>} data - Array of objects to display
   * @param {Array<string>} [columns] - Column keys to display (defaults to all)
   */
  table(data, columns) {
    if (!data || data.length === 0) {
      this.info('No data to display');
      return;
    }

    const keys = columns || Object.keys(data[0]);

    // Calculate column widths
    const widths = {};
    keys.forEach(key => {
      widths[key] = Math.max(
        key.length,
        ...data.map(row => String(row[key] || '').length)
      );
    });

    // Print header
    const headerRow = keys.map(key =>
      chalk.bold(key.padEnd(widths[key]))
    ).join('  ');
    console.log(headerRow);
    console.log(keys.map(key =>
      '─'.repeat(widths[key])
    ).join('  '));

    // Print rows
    data.forEach(row => {
      const dataRow = keys.map(key =>
        String(row[key] || '').padEnd(widths[key])
      ).join('  ');
      console.log(dataRow);
    });
  }

  /**
   * Display key-value pairs
   * @param {Object} data - Object with key-value pairs
   */
  keyValue(data) {
    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = chalk.gray(`${key.padEnd(maxKeyLength)}:`);
      console.log(`${formattedKey} ${value}`);
    });
  }

  /**
   * Display JSON with syntax highlighting
   * @param {Object} data - Data to display as JSON
   * @param {number} [indent=2] - Indentation level
   */
  json(data, indent = 2) {
    const json = JSON.stringify(data, null, indent);
    // Basic syntax highlighting
    const highlighted = json
      .replace(/"([^"]+)":/g, chalk.blue('"$1"') + ':')  // keys
      .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"'))  // string values
      .replace(/: (\d+)/g, ': ' + chalk.yellow('$1'))  // numbers
      .replace(/: (true|false|null)/g, ': ' + chalk.magenta('$1'));  // booleans/null

    console.log(highlighted);
  }

  /**
   * Create a spinner for long-running operations
   * @param {string} text - Spinner text
   * @returns {Object} Spinner object with update/succeed/fail/stop methods
   */
  spinner(text) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let interval = null;
    let currentText = text;

    const render = () => {
      process.stdout.write(`\r${chalk.cyan(frames[frameIndex])} ${currentText}`);
      frameIndex = (frameIndex + 1) % frames.length;
    };

    const clear = () => {
      process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 80) + '\r');
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(render, 80);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
        clear();
      }
    };

    // Auto-start
    start();

    return {
      update: (newText) => {
        currentText = newText;
      },
      succeed: (message) => {
        stop();
        this.success(message || currentText);
      },
      fail: (message) => {
        stop();
        this.error(message || currentText);
      },
      stop: () => {
        stop();
      }
    };
  }

  /**
   * Prompt user with a question (uses @inquirer/prompts)
   * @param {Object} question - Question configuration
   * @returns {Promise<any>} User's answer
   */
  async prompt(question) {
    const { type, name, message, choices, initial, validate } = question;

    try {
      switch (type) {
        case 'select':
          return await select({ message, choices, default: initial });

        case 'input':
          return await input({ message, default: initial, validate });

        case 'confirm':
          return await confirm({ message, default: initial });

        case 'checkbox':
          return await checkbox({ message, choices, validate });

        case 'password':
          return await password({ message, validate });

        default:
          throw new Error(`Unknown prompt type: ${type}`);
      }
    } catch (error) {
      // User cancelled (Ctrl+C)
      if (error.message === 'User force closed the prompt') {
        this.warn('Operation cancelled by user');
        process.exit(0);
      }
      throw error;
    }
  }

  /**
   * Prompt for confirmation
   * @param {string} message - Confirmation message
   * @param {boolean} [defaultValue=false] - Default value
   * @returns {Promise<boolean>} User's answer
   */
  async confirm(message, defaultValue = false) {
    return this.prompt({
      type: 'confirm',
      message,
      initial: defaultValue
    });
  }

  /**
   * Prompt for text input
   * @param {string} message - Input message
   * @param {string} [defaultValue] - Default value
   * @param {Function} [validate] - Validation function
   * @returns {Promise<string>} User's input
   */
  async input(message, defaultValue, validate) {
    return this.prompt({
      type: 'input',
      message,
      initial: defaultValue,
      validate
    });
  }

  /**
   * Prompt for selection from a list
   * @param {string} message - Selection message
   * @param {Array<Object|string>} choices - Array of choices
   * @param {any} [defaultValue] - Default value
   * @returns {Promise<any>} Selected value
   */
  async select(message, choices, defaultValue) {
    // Normalize choices to {name, value} format
    const normalizedChoices = choices.map(choice => {
      if (typeof choice === 'string') {
        return { name: choice, value: choice };
      }
      return choice;
    });

    return this.prompt({
      type: 'select',
      message,
      choices: normalizedChoices,
      initial: defaultValue
    });
  }

  /**
   * Prompt for multiple selections
   * @param {string} message - Selection message
   * @param {Array<Object|string>} choices - Array of choices
   * @returns {Promise<Array>} Selected values
   */
  async checkbox(message, choices) {
    // Normalize choices to {name, value, checked} format
    const normalizedChoices = choices.map(choice => {
      if (typeof choice === 'string') {
        return { name: choice, value: choice, checked: false };
      }
      return { ...choice, checked: choice.checked || false };
    });

    return this.prompt({
      type: 'checkbox',
      message,
      choices: normalizedChoices
    });
  }

  /**
   * Prompt for password input
   * @param {string} message - Password prompt message
   * @param {Function} [validate] - Validation function
   * @returns {Promise<string>} User's password
   */
  async password(message, validate) {
    return this.prompt({
      type: 'password',
      message,
      validate
    });
  }

  /**
   * Display a progress bar
   * @param {number} current - Current progress (0-100)
   * @param {number} total - Total (usually 100)
   * @param {string} [message] - Optional message
   */
  progress(current, total = 100, message = '') {
    const percentage = Math.round((current / total) * 100);
    const barLength = 40;
    const filledLength = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    process.stdout.write(
      `\r${chalk.cyan(bar)} ${chalk.bold(`${percentage}%`)} ${message}`
    );

    if (current >= total) {
      console.log(''); // New line when complete
    }
  }

  /**
   * Log raw message without formatting (for compatibility)
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    console.log(...args);
  }
}

// Export a singleton instance
module.exports = new Output();
