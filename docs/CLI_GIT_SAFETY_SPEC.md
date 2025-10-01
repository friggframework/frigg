# Frigg CLI: Git Safety & Pre-Flight Checks

## Overview

The Frigg CLI should check git status before operations and warn users about uncommitted changes, but **NOT** automatically create commits or branches. Users maintain full control over their git workflow.

---

## Design Philosophy

### Core Principles

1. **Non-Invasive** - CLI doesn't modify git state (no commits, branches, stashes)
2. **Informative** - Clearly shows what will be modified
3. **User Choice** - Always gives option to bail out
4. **Safety First** - Warns about potential issues before proceeding

### What CLI Does

✅ **Check git status**
✅ **Warn about uncommitted changes**
✅ **Show which files will be modified/created**
✅ **Give option to cancel and commit first**
✅ **Track created files for informational purposes**

### What CLI Does NOT Do

❌ Create commits
❌ Create branches
❌ Stash changes
❌ Stage files
❌ Modify git state in any way

---

## Pre-Flight Safety Check

### Simple Safety Check Implementation

```javascript
// utils/git-safety.js

const {execSync} = require('child_process');
const chalk = require('chalk');

class GitSafetyCheck {
    constructor(cwd = process.cwd()) {
        this.cwd = cwd;
    }

    /**
     * Check if directory is a git repository
     */
    isGitRepo() {
        try {
            execSync('git rev-parse --git-dir', {
                cwd: this.cwd,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get git status information
     */
    getStatus() {
        if (!this.isGitRepo()) {
            return null;
        }

        try {
            const statusOutput = execSync('git status --porcelain', {
                cwd: this.cwd,
                encoding: 'utf-8'
            });

            const branch = execSync('git branch --show-current', {
                cwd: this.cwd,
                encoding: 'utf-8'
            }).trim();

            const uncommittedFiles = statusOutput
                .trim()
                .split('\n')
                .filter(line => line.length > 0)
                .map(line => ({
                    status: line.substring(0, 2),
                    file: line.substring(3)
                }));

            return {
                branch,
                clean: uncommittedFiles.length === 0,
                uncommittedFiles,
                uncommittedCount: uncommittedFiles.length
            };
        } catch {
            return null;
        }
    }

    /**
     * Display warning about uncommitted changes
     */
    displayUncommittedWarning(status) {
        console.log(chalk.yellow('\n⚠️  Warning: You have uncommitted changes:\n'));

        // Show up to 10 files
        const filesToShow = status.uncommittedFiles.slice(0, 10);
        filesToShow.forEach(({status: fileStatus, file}) => {
            const statusSymbol = this.getStatusSymbol(fileStatus);
            console.log(`  ${statusSymbol} ${file}`);
        });

        if (status.uncommittedFiles.length > 10) {
            console.log(chalk.dim(`  ... and ${status.uncommittedFiles.length - 10} more files`));
        }

        console.log();
    }

    /**
     * Get human-readable status symbol
     */
    getStatusSymbol(status) {
        const statusMap = {
            'M ': chalk.yellow('M'),  // Modified
            ' M': chalk.yellow('M'),  // Modified (working directory)
            'A ': chalk.green('A'),   // Added
            'D ': chalk.red('D'),     // Deleted
            'R ': chalk.cyan('R'),    // Renamed
            '??': chalk.red('?'),     // Untracked
            'MM': chalk.yellow('M'),  // Modified in both
        };
        return statusMap[status] || status;
    }

    /**
     * Show files that will be created/modified by CLI
     */
    displayPlannedChanges(filesToCreate, filesToModify) {
        console.log(chalk.cyan('\n📝 The following files will be affected:\n'));

        if (filesToCreate.length > 0) {
            console.log(chalk.green('  Files to create:'));
            filesToCreate.forEach(file => {
                console.log(chalk.green(`    + ${file}`));
            });
        }

        if (filesToModify.length > 0) {
            console.log(chalk.yellow('\n  Files to modify:'));
            filesToModify.forEach(file => {
                console.log(chalk.yellow(`    ~ ${file}`));
            });
        }

        console.log();
    }

    /**
     * Run pre-flight check and get user confirmation
     */
    async runPreFlightCheck(filesToCreate = [], filesToModify = []) {
        const status = this.getStatus();

        // Not a git repo - just inform and continue
        if (!status) {
            console.log(chalk.dim('ℹ️  Not a git repository\n'));
            this.displayPlannedChanges(filesToCreate, filesToModify);
            return {proceed: true, reason: 'not-a-repo'};
        }

        // Show current branch
        console.log(chalk.cyan(`📍 Current branch: ${chalk.bold(status.branch)}`));

        // Working directory is clean - show changes and continue
        if (status.clean) {
            console.log(chalk.green('✓ Working directory is clean\n'));
            this.displayPlannedChanges(filesToCreate, filesToModify);
            return {proceed: true, reason: 'clean'};
        }

        // Uncommitted changes - warn and ask
        this.displayUncommittedWarning(status);
        this.displayPlannedChanges(filesToCreate, filesToModify);

        console.log(chalk.yellow('The CLI will create/modify files that will be mixed with your uncommitted changes.'));
        console.log(chalk.dim('Recommendation: Commit or stash your changes first.\n'));

        const {confirm} = require('@inquirer/prompts');
        const proceed = await confirm({
            message: 'Do you want to continue anyway?',
            default: false
        });

        if (!proceed) {
            console.log(chalk.dim('\nOperation cancelled. You can:'));
            console.log(chalk.dim('  • Commit your changes: git add . && git commit -m "message"'));
            console.log(chalk.dim('  • Stash your changes: git stash'));
            console.log(chalk.dim('  • Review changes: git status'));
            return {proceed: false, reason: 'user-cancelled'};
        }

        console.log(chalk.yellow('\n⚠️  Proceeding with uncommitted changes...\n'));
        return {proceed: true, reason: 'user-confirmed'};
    }
}

module.exports = {GitSafetyCheck};
```

---

## Integration with CLI Commands

### Basic Integration Pattern

```javascript
// Example: frigg create integration command

const {GitSafetyCheck} = require('./utils/git-safety');
const chalk = require('chalk');

async function createIntegrationCommand(name, options) {
    console.log(chalk.bold(`\nCreating integration: ${name}\n`));

    // Determine what files will be affected
    const filesToCreate = [
        `backend/src/integrations/${name}/Integration.js`,
        `backend/src/integrations/${name}/definition.js`,
        `backend/src/integrations/${name}/integration-definition.json`,
        `backend/src/integrations/${name}/config.json`,
        `backend/src/integrations/${name}/README.md`,
        `backend/src/integrations/${name}/.env.example`,
        `backend/src/integrations/${name}/tests/integration.test.js`,
    ];

    const filesToModify = [
        'backend/app-definition.json',
        'backend/backend.js',
        'backend/.env.example',
    ];

    // Run pre-flight check
    const safety = new GitSafetyCheck();
    const {proceed} = await safety.runPreFlightCheck(filesToCreate, filesToModify);

    if (!proceed) {
        process.exit(0);
    }

    // Proceed with creating integration
    try {
        await createIntegration(name, options);

        // Success message with git guidance
        console.log(chalk.green(`\n✅ Integration "${name}" created successfully!\n`));

        // Show what was created/modified
        console.log(chalk.cyan('Files created/modified:'));
        console.log(chalk.green(`  • ${filesToCreate.length} new files`));
        console.log(chalk.yellow(`  • ${filesToModify.length} modified files\n`));

        // Git guidance
        const status = safety.getStatus();
        if (status && status.isGitRepo()) {
            console.log(chalk.dim('Next steps:'));
            console.log(chalk.dim('  1. Review changes: git status'));
            console.log(chalk.dim('  2. Review diff: git diff'));
            console.log(chalk.dim(`  3. Commit: git add . && git commit -m "feat: add ${name} integration"`));
        }

    } catch (error) {
        console.error(chalk.red('\n❌ Error creating integration:'), error.message);
        process.exit(1);
    }
}
```

### With CLI Flags

```javascript
// Allow users to skip safety checks if they want
program
    .command('create integration <name>')
    .option('--force', 'Skip safety checks and proceed')
    .option('--dry-run', 'Show what would be created without creating')
    .action(async (name, options) => {
        // Dry run - show changes without creating
        if (options.dryRun) {
            const safety = new GitSafetyCheck();
            safety.displayPlannedChanges(filesToCreate, filesToModify);
            console.log(chalk.dim('\n(Dry run - no files were created)'));
            return;
        }

        // Skip safety check if --force
        if (!options.force) {
            const safety = new GitSafetyCheck();
            const {proceed} = await safety.runPreFlightCheck(
                filesToCreate,
                filesToModify
            );

            if (!proceed) {
                process.exit(0);
            }
        }

        // Create integration...
    });
```

---

## Post-Operation Guidance

### Show Next Steps After Success

```javascript
function displayPostOperationGuidance(operationType, name, filesCreated, filesModified) {
    const safety = new GitSafetyCheck();
    const status = safety.getStatus();

    console.log(chalk.green(`\n✅ ${operationType} "${name}" created successfully!\n`));

    // Summary
    console.log(chalk.cyan('📊 Summary:'));
    console.log(`  • ${filesCreated.length} files created`);
    console.log(`  • ${filesModified.length} files modified\n`);

    // Git repo - provide git guidance
    if (status && status.isGitRepo()) {
        console.log(chalk.cyan('📝 Next Steps:\n'));

        console.log(chalk.white('1. Review your changes:'));
        console.log(chalk.dim('   git status'));
        console.log(chalk.dim('   git diff\n'));

        console.log(chalk.white('2. Stage and commit:'));
        const commitMessage = getRecommendedCommitMessage(operationType, name);
        console.log(chalk.dim('   git add .'));
        console.log(chalk.dim(`   git commit -m "${commitMessage}"\n`));

        // Suggest branch if on main/master
        if (['main', 'master', 'production'].includes(status.branch)) {
            console.log(chalk.yellow('💡 Tip: You\'re on the "' + status.branch + '" branch.'));
            console.log(chalk.dim('   Consider creating a feature branch:'));
            console.log(chalk.dim(`   git checkout -b feature/${name}\n`));
        }
    } else {
        // Not a git repo
        console.log(chalk.dim('💡 Tip: Initialize git to track your changes:'));
        console.log(chalk.dim('   git init'));
        console.log(chalk.dim('   git add .'));
        console.log(chalk.dim('   git commit -m "Initial commit"\n'));
    }
}

function getRecommendedCommitMessage(operationType, name) {
    const typeMap = {
        'integration': 'feat',
        'api-module': 'feat',
        'config': 'chore'
    };

    const commitType = typeMap[operationType] || 'feat';

    switch (operationType) {
        case 'integration':
            return `${commitType}: add ${name} integration`;
        case 'api-module':
            return `${commitType}: add ${name} api module`;
        default:
            return `${commitType}: ${operationType} ${name}`;
    }
}
```

---

## Example Flows

### Flow 1: Clean Working Directory

```bash
$ frigg create integration salesforce-sync

Creating integration: salesforce-sync

📍 Current branch: feature/new-integration
✓ Working directory is clean

📝 The following files will be affected:

  Files to create:
    + backend/src/integrations/salesforce-sync/Integration.js
    + backend/src/integrations/salesforce-sync/definition.js
    + backend/src/integrations/salesforce-sync/integration-definition.json
    + backend/src/integrations/salesforce-sync/config.json
    + backend/src/integrations/salesforce-sync/README.md
    + backend/src/integrations/salesforce-sync/.env.example
    + backend/src/integrations/salesforce-sync/tests/integration.test.js

  Files to modify:
    ~ backend/app-definition.json
    ~ backend/backend.js
    ~ backend/.env.example

[... creates files ...]

✅ Integration "salesforce-sync" created successfully!

📊 Summary:
  • 7 files created
  • 3 files modified

📝 Next Steps:

1. Review your changes:
   git status
   git diff

2. Stage and commit:
   git add .
   git commit -m "feat: add salesforce-sync integration"
```

### Flow 2: Uncommitted Changes (User Cancels)

```bash
$ frigg create integration salesforce-sync

Creating integration: salesforce-sync

📍 Current branch: main

⚠️  Warning: You have uncommitted changes:

  M backend/src/utils/helper.js
  M package.json
  ?? temp-notes.txt

📝 The following files will be affected:

  Files to create:
    + backend/src/integrations/salesforce-sync/Integration.js
    + backend/src/integrations/salesforce-sync/definition.js
    [...]

  Files to modify:
    ~ backend/app-definition.json
    ~ backend/backend.js
    ~ backend/.env.example

The CLI will create/modify files that will be mixed with your uncommitted changes.
Recommendation: Commit or stash your changes first.

? Do you want to continue anyway? No

Operation cancelled. You can:
  • Commit your changes: git add . && git commit -m "message"
  • Stash your changes: git stash
  • Review changes: git status
```

### Flow 3: Uncommitted Changes (User Proceeds)

```bash
$ frigg create integration salesforce-sync

Creating integration: salesforce-sync

📍 Current branch: main

⚠️  Warning: You have uncommitted changes:

  M backend/src/utils/helper.js
  M package.json

📝 The following files will be affected:

  Files to create:
    + backend/src/integrations/salesforce-sync/Integration.js
    [...]

  Files to modify:
    ~ backend/app-definition.json
    ~ backend/backend.js

The CLI will create/modify files that will be mixed with your uncommitted changes.
Recommendation: Commit or stash your changes first.

? Do you want to continue anyway? Yes

⚠️  Proceeding with uncommitted changes...

[... creates files ...]

✅ Integration "salesforce-sync" created successfully!

📊 Summary:
  • 7 files created
  • 3 files modified

📝 Next Steps:

1. Review your changes:
   git status
   git diff

2. Stage and commit:
   git add .
   git commit -m "feat: add salesforce-sync integration"
```

### Flow 4: Force Flag (Skip Check)

```bash
$ frigg create integration salesforce-sync --force

Creating integration: salesforce-sync

[... skips safety check, creates files ...]

✅ Integration "salesforce-sync" created successfully!

📊 Summary:
  • 7 files created
  • 3 files modified

📝 Next Steps:

1. Review your changes:
   git status
   git diff

2. Stage and commit:
   git add .
   git commit -m "feat: add salesforce-sync integration"
```

### Flow 5: Dry Run

```bash
$ frigg create integration salesforce-sync --dry-run

Creating integration: salesforce-sync

📍 Current branch: main
✓ Working directory is clean

📝 The following files will be affected:

  Files to create:
    + backend/src/integrations/salesforce-sync/Integration.js
    + backend/src/integrations/salesforce-sync/definition.js
    + backend/src/integrations/salesforce-sync/integration-definition.json
    + backend/src/integrations/salesforce-sync/config.json
    + backend/src/integrations/salesforce-sync/README.md
    + backend/src/integrations/salesforce-sync/.env.example
    + backend/src/integrations/salesforce-sync/tests/integration.test.js

  Files to modify:
    ~ backend/app-definition.json
    ~ backend/backend.js
    ~ backend/.env.example

(Dry run - no files were created)
```

---

## Additional Safety Features

### Detect Protected Branches

```javascript
class GitSafetyCheck {
    // ... existing methods ...

    /**
     * Check if on protected branch
     */
    isOnProtectedBranch() {
        const status = this.getStatus();
        if (!status) return false;

        const protectedBranches = ['main', 'master', 'production', 'prod'];
        return protectedBranches.includes(status.branch);
    }

    /**
     * Warn if on protected branch
     */
    displayProtectedBranchWarning(branch) {
        console.log(chalk.yellow(`\n⚠️  Warning: You're working on the "${branch}" branch.`));
        console.log(chalk.dim('Consider creating a feature branch first:'));
        console.log(chalk.dim('  git checkout -b feature/your-feature-name\n'));
    }

    /**
     * Enhanced pre-flight check with branch warning
     */
    async runPreFlightCheck(filesToCreate = [], filesToModify = []) {
        const status = this.getStatus();

        if (!status) {
            console.log(chalk.dim('ℹ️  Not a git repository\n'));
            this.displayPlannedChanges(filesToCreate, filesToModify);
            return {proceed: true, reason: 'not-a-repo'};
        }

        console.log(chalk.cyan(`📍 Current branch: ${chalk.bold(status.branch)}`));

        // Warn about protected branch
        if (this.isOnProtectedBranch()) {
            this.displayProtectedBranchWarning(status.branch);
        }

        // Rest of the checks...
        if (status.clean) {
            console.log(chalk.green('✓ Working directory is clean\n'));
            this.displayPlannedChanges(filesToCreate, filesToModify);
            return {proceed: true, reason: 'clean'};
        }

        // Handle uncommitted changes...
        this.displayUncommittedWarning(status);
        this.displayPlannedChanges(filesToCreate, filesToModify);

        console.log(chalk.yellow('The CLI will create/modify files that will be mixed with your uncommitted changes.'));
        console.log(chalk.dim('Recommendation: Commit or stash your changes first.\n'));

        const {confirm} = require('@inquirer/prompts');
        const proceed = await confirm({
            message: 'Do you want to continue anyway?',
            default: false
        });

        if (!proceed) {
            console.log(chalk.dim('\nOperation cancelled. You can:'));
            console.log(chalk.dim('  • Commit your changes: git add . && git commit -m "message"'));
            console.log(chalk.dim('  • Stash your changes: git stash'));
            console.log(chalk.dim('  • Create a branch: git checkout -b feature/branch-name'));
            console.log(chalk.dim('  • Review changes: git status'));
            return {proceed: false, reason: 'user-cancelled'};
        }

        console.log(chalk.yellow('\n⚠️  Proceeding with uncommitted changes...\n'));
        return {proceed: true, reason: 'user-confirmed'};
    }
}
```

---

## Summary

### What CLI Does

1. **Pre-Operation**
   - ✅ Check if git repo
   - ✅ Check for uncommitted changes
   - ✅ Show which files will be affected
   - ✅ Warn if on protected branch
   - ✅ Give option to cancel

2. **During Operation**
   - ✅ Create/modify files as planned

3. **Post-Operation**
   - ✅ Show summary of changes
   - ✅ Provide git commands as guidance
   - ✅ Suggest next steps

### What CLI Does NOT Do

- ❌ Create commits
- ❌ Create branches
- ❌ Stage files
- ❌ Stash changes
- ❌ Push to remote
- ❌ Modify git state

### User Experience

- **Informed**: Always knows what will change
- **In Control**: Can cancel at any time
- **Guided**: Gets helpful next steps
- **Safe**: Warned about potential issues

### CLI Flags

```bash
--force      # Skip safety checks
--dry-run    # Preview changes without creating
```

---

*This approach keeps git operations simple and non-invasive while ensuring users are informed and safe.*
