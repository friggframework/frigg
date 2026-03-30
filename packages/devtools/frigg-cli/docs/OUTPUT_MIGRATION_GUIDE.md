# Output Class Migration Guide

This guide shows how to migrate existing CLI commands to use the new unified `Output` class.

## Why Migrate?

The unified `Output` class provides:
- **Consistency**: Same UI patterns across all commands
- **Better UX**: Spinners, progress bars, formatted tables
- **Maintainability**: Single place to update UI behavior
- **Testing**: Easier to mock and test

## Before vs After

### Before (Inconsistent)

```javascript
// install-command/index.js (OLD - plain console.log)
function logError(message, error) {
    console.error(message, error);
}

function logSuccess(message) {
    console.log(message);
}

// Some other command (OLD - using chalk directly)
const chalk = require('chalk');
console.log(chalk.green('✓ Success'));
console.error(chalk.red('✗ Failed'));

// repair-command (OLD - using readline)
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question('Select option: ', (answer) => {
    // ...
});
```

### After (Consistent)

```javascript
// All commands use the same output utility
const output = require('./utils/output');

output.success('Operation completed');
output.error('Operation failed', error);

const spinner = output.spinner('Installing...');
// do work
spinner.succeed('Installed successfully');

const answer = await output.confirm('Continue with installation?');
```

## Migration Steps

### Step 1: Import Output

Replace all imports of `chalk`, `console`, and `readline`:

```diff
- const chalk = require('chalk');
- const readline = require('readline');
+ const output = require('../utils/output');
```

### Step 2: Replace Console Methods

| Old | New |
|-----|-----|
| `console.log('Success')` | `output.success('Success')` |
| `console.error('Error')` | `output.error('Error')` |
| `console.info('Info')` | `output.info('Info')` |
| `console.warn('Warning')` | `output.warn('Warning')` |
| `console.log(chalk.green('✓ Done'))` | `output.success('Done')` |
| `console.error(chalk.red('✗ Failed'))` | `output.error('Failed')` |

### Step 3: Replace Chalk Usage

```diff
- console.log(chalk.blue('Starting...'));
+ output.info('Starting...');

- console.log(chalk.bold('=== Header ==='));
+ output.header('Header');

- console.log(chalk.yellow('⚠ Warning'));
+ output.warn('Warning');
```

### Step 4: Replace Inquirer Prompts

```diff
- const { confirm } = require('@inquirer/prompts');
- const answer = await confirm({ message: 'Continue?' });
+ const answer = await output.confirm('Continue?');

- const { select } = require('@inquirer/prompts');
- const choice = await select({
-     message: 'Select option',
-     choices: ['Option 1', 'Option 2']
- });
+ const choice = await output.select('Select option', ['Option 1', 'Option 2']);
```

### Step 5: Replace Readline (repair-command)

```diff
- const readline = require('readline');
- const rl = readline.createInterface({
-     input: process.stdin,
-     output: process.stdout
- });
- rl.question('Select option: ', (answer) => {
-     // handle answer
-     rl.close();
- });
+ const answer = await output.input('Select option:');
+ // handle answer (no need to close)
```

### Step 6: Add Spinners for Long Operations

```diff
- console.log('Installing dependencies...');
- await installDependencies();
- console.log('Done');
+ const spinner = output.spinner('Installing dependencies...');
+ await installDependencies();
+ spinner.succeed('Dependencies installed');
```

### Step 7: Add Progress Bars

```diff
- console.log(`Progress: ${i}/${total}`);
+ output.progress(i, total, 'Processing files...');
```

### Step 8: Display Tables

```diff
- modules.forEach(mod => {
-     console.log(`${mod.name}\t${mod.version}\t${mod.status}`);
- });
+ output.table(modules, ['name', 'version', 'status']);
```

## Real Example: install-command

### Before

```javascript
// install-command/logger.js
function logError(message, error) {
    console.error(message, error);
    if (error && error.stack) {
        console.error(error.stack);
    }
}

function logSuccess(message) {
    console.log(message);
}

function logInfo(message) {
    console.log(message);
}

module.exports = {
    logError,
    logSuccess,
    logInfo
};

// install-command/index.js
const logger = require('./logger');

logger.logInfo('Starting installation...');
// ...
logger.logSuccess('Module installed successfully');
```

### After

```javascript
// install-command/index.js
const output = require('../utils/output');

const spinner = output.spinner('Installing module...');
try {
    // ... do installation
    spinner.succeed('Module installed successfully');
} catch (error) {
    spinner.fail('Installation failed');
    output.error('Failed to install module', error);
    process.exit(1);
}
```

**Result**: Delete `install-command/logger.js` (no longer needed!)

## Commands to Migrate

Priority order based on usage and inconsistency:

1. **install-command** (HIGH) - Uses plain console.log, has trivial logger wrapper
2. **repair-command** (HIGH) - Uses readline instead of inquirer
3. **doctor-command** (MEDIUM) - Long-running, needs spinners
4. **deploy-command** (MEDIUM) - Long-running, needs progress indication
5. **start-command** (LOW) - Already uses chalk consistently
6. **generate-command** (LOW) - Uses inquirer, but inconsistent colors
7. **build-command** (LOW) - Simple command, less output

## Testing Your Migration

After migrating a command:

1. **Run the command** manually to verify output looks correct
2. **Update tests** to mock `output` instead of `console`/`chalk`/`inquirer`
3. **Check for** color consistency, spinner behavior, error messages

### Test Example

```javascript
// Before
jest.spyOn(console, 'log');
await myCommand();
expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Success'));

// After
const output = require('../utils/output');
jest.spyOn(output, 'success');
await myCommand();
expect(output.success).toHaveBeenCalledWith('Operation completed');
```

## Output API Reference

### Messages
- `output.success(message)` - Green checkmark + message
- `output.error(message, error?)` - Red X + message (+ stack trace if DEBUG=1)
- `output.info(message)` - Blue info icon + message
- `output.warn(message)` - Yellow warning icon + message
- `output.debug(message)` - Gray message (only if DEBUG=1)

### Formatting
- `output.header(title)` - Bold cyan title with underline
- `output.separator()` - Gray horizontal line
- `output.newline()` - Blank line
- `output.table(data, columns?)` - Formatted table
- `output.keyValue(object)` - Key-value pairs
- `output.json(data, indent?)` - Syntax-highlighted JSON

### Interactive
- `output.confirm(message, default?)` - Yes/no question
- `output.input(message, default?, validate?)` - Text input
- `output.select(message, choices, default?)` - Single selection
- `output.checkbox(message, choices)` - Multiple selection
- `output.password(message, validate?)` - Password input

### Progress
- `output.spinner(text)` - Returns {update, succeed, fail, stop}
- `output.progress(current, total, message?)` - Progress bar

### Compatibility
- `output.log(...args)` - Raw console.log (for gradual migration)

## Benefits After Migration

- ✅ **32% less code** - Remove logger wrappers and boilerplate
- ✅ **100% consistency** - All commands look and feel the same
- ✅ **Better UX** - Spinners, progress bars, formatted tables
- ✅ **Easier testing** - Mock one module instead of many
- ✅ **Maintainable** - Update UI in one place

## Questions?

See:
- `utils/output.js` - Full implementation
- `__tests__/unit/utils/output.test.js` - Test examples
- `FRIGG_CLI_ANALYSIS_REPORT.md` - Why we created this
