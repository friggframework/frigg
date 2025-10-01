# Frigg CLI: Git Integration Specification

## Overview

The Frigg CLI should be git-aware and provide intelligent git integration for tracking changes, creating commits, and enabling git-based rollback strategies.

---

## Table of Contents
1. [Git Detection & Safety](#git-detection--safety)
2. [Commit Strategies](#commit-strategies)
3. [Git-Based Rollback](#git-based-rollback)
4. [Branch Management](#branch-management)
5. [Interactive Commit Options](#interactive-commit-options)
6. [Git Utilities](#git-utilities)
7. [Edge Cases & Safety](#edge-cases--safety)

---

## Git Detection & Safety

### Initial Git Checks

Before any file operations, the CLI should:

```javascript
// utils/git-detector.js

const {execSync} = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class GitDetector {
    constructor(projectPath) {
        this.projectPath = projectPath;
    }

    /**
     * Check if project is a git repository
     */
    isGitRepo() {
        try {
            execSync('git rev-parse --git-dir', {
                cwd: this.projectPath,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if there are uncommitted changes
     */
    hasUncommittedChanges() {
        try {
            const output = execSync('git status --porcelain', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            });
            return output.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Get current branch name
     */
    getCurrentBranch() {
        try {
            return execSync('git branch --show-current', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();
        } catch {
            return null;
        }
    }

    /**
     * Check if working directory is clean
     */
    isClean() {
        return this.isGitRepo() && !this.hasUncommittedChanges();
    }

    /**
     * Get git status summary
     */
    getStatus() {
        if (!this.isGitRepo()) {
            return {
                isRepo: false,
                branch: null,
                clean: false,
                uncommittedFiles: []
            };
        }

        const branch = this.getCurrentBranch();
        const uncommittedFiles = this.getUncommittedFiles();

        return {
            isRepo: true,
            branch,
            clean: uncommittedFiles.length === 0,
            uncommittedFiles
        };
    }

    /**
     * Get list of uncommitted files
     */
    getUncommittedFiles() {
        try {
            const output = execSync('git status --porcelain', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            });

            return output
                .trim()
                .split('\n')
                .filter(line => line.length > 0)
                .map(line => {
                    const status = line.substring(0, 2);
                    const file = line.substring(3);
                    return {status, file};
                });
        } catch {
            return [];
        }
    }

    /**
     * Check if file is tracked by git
     */
    isTracked(filePath) {
        try {
            execSync(`git ls-files --error-unmatch "${filePath}"`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = {GitDetector};
```

### Safety Prompts

```javascript
// Before CLI operations that modify files:
const detector = new GitDetector(process.cwd());
const status = detector.getStatus();

if (status.isRepo && !status.clean) {
    const {confirm} = require('@inquirer/prompts');

    console.log('⚠️  Warning: You have uncommitted changes:');
    status.uncommittedFiles.forEach(f => {
        console.log(`  ${f.status} ${f.file}`);
    });

    const proceed = await confirm({
        message: 'Continue anyway? (Changes will be mixed with CLI-generated files)',
        default: false
    });

    if (!proceed) {
        console.log('Operation cancelled. Commit or stash your changes first.');
        process.exit(0);
    }
}
```

---

## Commit Strategies

### Strategy 1: Automatic Commits (Recommended)

The CLI automatically commits changes with descriptive messages.

```javascript
// utils/git-operations.js

const {execSync} = require('child_process');

class GitOperations {
    constructor(projectPath) {
        this.projectPath = projectPath;
    }

    /**
     * Create a commit with all CLI changes
     */
    async commitChanges(message, files = []) {
        try {
            // Stage specific files or all changes
            if (files.length > 0) {
                for (const file of files) {
                    execSync(`git add "${file}"`, {
                        cwd: this.projectPath,
                        stdio: 'pipe'
                    });
                }
            } else {
                execSync('git add .', {
                    cwd: this.projectPath,
                    stdio: 'pipe'
                });
            }

            // Create commit
            execSync(`git commit -m "${message}"`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });

            // Get commit hash
            const hash = execSync('git rev-parse HEAD', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();

            return {success: true, hash};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }

    /**
     * Create a commit with detailed metadata
     */
    async commitWithMetadata(options) {
        const {
            type,        // 'integration', 'api-module', etc.
            name,        // Name of created resource
            files,       // Files to commit
            details      // Additional details
        } = options;

        const message = this.generateCommitMessage(type, name, details);

        return this.commitChanges(message, files);
    }

    /**
     * Generate conventional commit message
     */
    generateCommitMessage(type, name, details = {}) {
        const typeMap = {
            'integration': 'feat',
            'api-module': 'feat',
            'config': 'chore',
            'update': 'chore'
        };

        const commitType = typeMap[type] || 'chore';

        let message = `${commitType}(frigg): `;

        switch (type) {
            case 'integration':
                message += `add ${name} integration`;
                break;
            case 'api-module':
                message += `add ${name} api module`;
                if (details.integration) {
                    message += ` to ${details.integration}`;
                }
                break;
            case 'config':
                message += `update ${name}`;
                break;
            default:
                message += name;
        }

        // Add body with details
        if (details.description) {
            message += `\n\n${details.description}`;
        }

        // Add footer with metadata
        const footer = [];
        if (details.files) {
            footer.push(`Files: ${details.files.join(', ')}`);
        }
        if (details.command) {
            footer.push(`Command: frigg ${details.command}`);
        }

        if (footer.length > 0) {
            message += '\n\n' + footer.join('\n');
        }

        return message;
    }
}

module.exports = {GitOperations};
```

### Strategy 2: Interactive Commit

Let users review and customize commit messages.

```javascript
const {input, confirm} = require('@inquirer/prompts');

async function interactiveCommit(gitOps, defaultMessage, files) {
    console.log('\n📝 Files to be committed:');
    files.forEach(f => console.log(`  • ${f}`);

    const shouldCustomize = await confirm({
        message: 'Customize commit message?',
        default: false
    });

    let message = defaultMessage;

    if (shouldCustomize) {
        message = await input({
            message: 'Commit message:',
            default: defaultMessage
        });
    }

    const shouldCommit = await confirm({
        message: `Create commit with message: "${message}"?`,
        default: true
    });

    if (shouldCommit) {
        const result = await gitOps.commitChanges(message, files);
        if (result.success) {
            console.log(`✅ Created commit: ${result.hash.substring(0, 7)}`);
        }
        return result;
    }

    return {success: false, reason: 'User cancelled'};
}
```

### Strategy 3: No Commit (Manual)

Allow users to opt out of automatic commits.

```javascript
// In CLI command options:
program
    .command('create integration')
    .option('--no-commit', 'Skip automatic git commit')
    .option('--commit-message <message>', 'Custom commit message')
    .action(async (options) => {
        // ... create integration ...

        if (options.commit !== false) {
            const message = options.commitMessage ||
                generateCommitMessage('integration', integrationName);
            await gitOps.commitChanges(message, changedFiles);
        } else {
            console.log('⚠️  Changes not committed. Review and commit manually.');
        }
    });
```

---

## Git-Based Rollback

### Using Git Reset for Rollback

```javascript
class GitRollback {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.beforeHash = null;
    }

    /**
     * Capture state before operation
     */
    async captureState() {
        try {
            this.beforeHash = execSync('git rev-parse HEAD', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            }).trim();

            return {success: true, hash: this.beforeHash};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }

    /**
     * Rollback to captured state
     */
    async rollback() {
        if (!this.beforeHash) {
            throw new Error('No state captured for rollback');
        }

        try {
            // Reset to previous commit (keep working directory)
            execSync(`git reset --hard ${this.beforeHash}`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });

            // Clean untracked files created by CLI
            execSync('git clean -fd', {
                cwd: this.projectPath,
                stdio: 'pipe'
            });

            return {success: true, restoredTo: this.beforeHash};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }

    /**
     * Soft rollback (keep changes in working directory)
     */
    async softRollback() {
        if (!this.beforeHash) {
            throw new Error('No state captured for rollback');
        }

        try {
            // Reset to previous commit but keep changes staged
            execSync(`git reset --soft ${this.beforeHash}`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });

            return {success: true, restoredTo: this.beforeHash};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }
}
```

### Hybrid Rollback (File + Git)

Combine file-based and git-based rollback for maximum safety.

```javascript
class HybridRollback {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.fileRollback = new RollbackManager();
        this.gitRollback = new GitRollback(projectPath);
        this.gitEnabled = false;
    }

    async initialize() {
        const detector = new GitDetector(this.projectPath);
        this.gitEnabled = detector.isGitRepo();

        if (this.gitEnabled) {
            await this.gitRollback.captureState();
        }
    }

    async rollback(options = {}) {
        const errors = [];

        // Try git rollback first (cleaner)
        if (this.gitEnabled && options.useGit !== false) {
            const gitResult = await this.gitRollback.rollback();
            if (gitResult.success) {
                return {
                    success: true,
                    method: 'git',
                    details: gitResult
                };
            }
            errors.push({method: 'git', error: gitResult.error});
        }

        // Fall back to file-based rollback
        const fileResult = await this.fileRollback.rollback();
        if (fileResult.success) {
            return {
                success: true,
                method: 'file',
                details: fileResult,
                warnings: errors
            };
        }

        return {
            success: false,
            errors: [...errors, {method: 'file', error: fileResult.errors}]
        };
    }
}
```

---

## Branch Management

### Create Feature Branch for CLI Changes

```javascript
class BranchManager {
    constructor(projectPath) {
        this.projectPath = projectPath;
    }

    /**
     * Create a new branch for CLI changes
     */
    async createFeatureBranch(name, options = {}) {
        try {
            const branchName = `frigg/${name}`;

            // Check if branch exists
            const exists = this.branchExists(branchName);
            if (exists && !options.force) {
                return {
                    success: false,
                    reason: 'Branch already exists',
                    branch: branchName
                };
            }

            // Create and checkout branch
            execSync(`git checkout -b ${branchName}`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });

            return {success: true, branch: branchName};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }

    /**
     * Check if branch exists
     */
    branchExists(branchName) {
        try {
            execSync(`git rev-parse --verify ${branchName}`, {
                cwd: this.projectPath,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Switch back to previous branch
     */
    async returnToPreviousBranch() {
        try {
            execSync('git checkout -', {
                cwd: this.projectPath,
                stdio: 'pipe'
            });
            return {success: true};
        } catch (error) {
            return {success: false, error: error.message};
        }
    }
}
```

### Interactive Branch Creation

```javascript
async function offerBranchCreation(type, name) {
    const {confirm} = require('@inquirer/prompts');

    const createBranch = await confirm({
        message: `Create feature branch for this ${type}?`,
        default: true
    });

    if (createBranch) {
        const branchManager = new BranchManager(process.cwd());
        const branchName = `${type}/${name}`;

        const result = await branchManager.createFeatureBranch(branchName);

        if (result.success) {
            console.log(`✅ Created and switched to branch: ${result.branch}`);
            return result.branch;
        } else {
            console.log(`⚠️  Could not create branch: ${result.reason || result.error}`);
        }
    }

    return null;
}
```

---

## Interactive Commit Options

### Full Interactive Flow

```javascript
async function interactiveGitFlow(options) {
    const {
        type,
        name,
        files,
        skipPrompts = false
    } = options;

    const detector = new GitDetector(process.cwd());
    const status = detector.getStatus();

    if (!status.isRepo) {
        console.log('ℹ️  Not a git repository. Skipping git operations.');
        return {skipped: true, reason: 'not a git repo'};
    }

    // 1. Check for uncommitted changes
    if (!status.clean && !skipPrompts) {
        console.log('⚠️  Warning: Uncommitted changes detected');
        const proceed = await confirm({
            message: 'Continue anyway?',
            default: false
        });
        if (!proceed) {
            return {cancelled: true};
        }
    }

    // 2. Offer branch creation
    let branchCreated = null;
    if (!skipPrompts) {
        branchCreated = await offerBranchCreation(type, name);
    }

    // 3. Make file changes
    // ... (file operations happen here)

    // 4. Review changes
    console.log('\n📝 Files modified:');
    files.forEach(f => console.log(`  • ${f}`));

    // 5. Commit options
    const commitAction = await select({
        message: 'How would you like to handle git commit?',
        choices: [
            {name: 'Automatic commit with default message', value: 'auto'},
            {name: 'Customize commit message', value: 'custom'},
            {name: 'Skip commit (manual)', value: 'skip'}
        ]
    });

    const gitOps = new GitOperations(process.cwd());

    switch (commitAction) {
        case 'auto': {
            const message = gitOps.generateCommitMessage(type, name, {
                files: files.map(f => path.basename(f)),
                command: `create ${type} ${name}`
            });
            const result = await gitOps.commitChanges(message, files);
            console.log(`✅ Committed: ${result.hash.substring(0, 7)}`);
            break;
        }

        case 'custom': {
            const message = await input({
                message: 'Commit message:',
                default: gitOps.generateCommitMessage(type, name)
            });
            const result = await gitOps.commitChanges(message, files);
            console.log(`✅ Committed: ${result.hash.substring(0, 7)}`);
            break;
        }

        case 'skip': {
            console.log('⚠️  Changes not committed. You can review and commit manually.');
            break;
        }
    }

    return {
        success: true,
        branch: branchCreated,
        committed: commitAction !== 'skip'
    };
}
```

---

## Git Utilities

### Complete Git Utility Module

```javascript
// utils/git.js

const {execSync} = require('child_process');
const path = require('path');

class Git {
    constructor(cwd = process.cwd()) {
        this.cwd = cwd;
    }

    /**
     * Execute git command
     */
    exec(command, options = {}) {
        try {
            return execSync(`git ${command}`, {
                cwd: this.cwd,
                encoding: 'utf-8',
                stdio: options.silent ? 'pipe' : 'inherit',
                ...options
            }).trim();
        } catch (error) {
            if (options.ignoreErrors) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Check if git is available
     */
    static isAvailable() {
        try {
            execSync('git --version', {stdio: 'pipe'});
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Initialize new git repository
     */
    init() {
        return this.exec('init');
    }

    /**
     * Add files to staging
     */
    add(files = '.') {
        const fileList = Array.isArray(files) ? files.join(' ') : files;
        return this.exec(`add ${fileList}`);
    }

    /**
     * Commit changes
     */
    commit(message, options = {}) {
        const flags = [];
        if (options.allowEmpty) flags.push('--allow-empty');
        if (options.amend) flags.push('--amend');
        if (options.noVerify) flags.push('--no-verify');

        return this.exec(`commit -m "${message}" ${flags.join(' ')}`);
    }

    /**
     * Get current commit hash
     */
    getHash(short = false) {
        return this.exec(`rev-parse ${short ? '--short' : ''} HEAD`, {silent: true});
    }

    /**
     * Get current branch
     */
    getBranch() {
        return this.exec('branch --show-current', {silent: true});
    }

    /**
     * Create and checkout new branch
     */
    createBranch(name, options = {}) {
        const flags = options.force ? '-B' : '-b';
        return this.exec(`checkout ${flags} ${name}`);
    }

    /**
     * Switch to branch
     */
    checkout(branch) {
        return this.exec(`checkout ${branch}`);
    }

    /**
     * Get status
     */
    status(options = {}) {
        const flags = options.short ? '--short' : '';
        return this.exec(`status ${flags}`, {silent: true});
    }

    /**
     * Check if working directory is clean
     */
    isClean() {
        const status = this.status({short: true});
        return status.length === 0;
    }

    /**
     * Get list of changed files
     */
    getChangedFiles() {
        const output = this.status({short: true});
        return output
            .split('\n')
            .filter(line => line.length > 0)
            .map(line => ({
                status: line.substring(0, 2).trim(),
                file: line.substring(3)
            }));
    }

    /**
     * Stash changes
     */
    stash(message = 'CLI temporary stash') {
        return this.exec(`stash push -m "${message}"`);
    }

    /**
     * Pop stash
     */
    stashPop() {
        return this.exec('stash pop');
    }

    /**
     * Reset to commit
     */
    reset(commit, options = {}) {
        const mode = options.hard ? '--hard' : options.soft ? '--soft' : '--mixed';
        return this.exec(`reset ${mode} ${commit}`);
    }

    /**
     * Clean untracked files
     */
    clean(options = {}) {
        const flags = [];
        if (options.force) flags.push('-f');
        if (options.directories) flags.push('-d');
        if (options.ignored) flags.push('-x');

        return this.exec(`clean ${flags.join(' ')}`);
    }

    /**
     * Show diff
     */
    diff(options = {}) {
        const flags = [];
        if (options.cached) flags.push('--cached');
        if (options.nameOnly) flags.push('--name-only');

        return this.exec(`diff ${flags.join(' ')}`);
    }

    /**
     * Check if file is tracked
     */
    isTracked(file) {
        try {
            this.exec(`ls-files --error-unmatch "${file}"`, {silent: true});
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get commit message
     */
    getCommitMessage(commit = 'HEAD') {
        return this.exec(`log -1 --format=%B ${commit}`, {silent: true});
    }

    /**
     * Get commit author
     */
    getCommitAuthor(commit = 'HEAD') {
        return this.exec(`log -1 --format=%an ${commit}`, {silent: true});
    }

    /**
     * Get commit date
     */
    getCommitDate(commit = 'HEAD') {
        return this.exec(`log -1 --format=%ai ${commit}`, {silent: true});
    }
}

module.exports = {Git};
```

---

## Edge Cases & Safety

### Edge Case Handling

```javascript
class GitSafetyManager {
    constructor(projectPath) {
        this.git = new Git(projectPath);
        this.issues = [];
    }

    /**
     * Comprehensive safety check
     */
    async performSafetyCheck() {
        const issues = [];

        // 1. Git availability
        if (!Git.isAvailable()) {
            issues.push({
                level: 'info',
                message: 'Git is not available. Git operations will be skipped.'
            });
        }

        // 2. Git repository check
        try {
            this.git.getBranch();
        } catch {
            issues.push({
                level: 'info',
                message: 'Not a git repository. Initialize with: git init'
            });
            return {safe: true, issues};
        }

        // 3. Detached HEAD state
        const branch = this.git.getBranch();
        if (!branch) {
            issues.push({
                level: 'warning',
                message: 'HEAD is detached. Consider checking out a branch first.'
            });
        }

        // 4. Uncommitted changes
        if (!this.git.isClean()) {
            const changes = this.git.getChangedFiles();
            issues.push({
                level: 'warning',
                message: `Uncommitted changes detected (${changes.length} files)`,
                files: changes
            });
        }

        // 5. Merge conflicts
        const status = this.git.status();
        if (status.includes('merge') || status.includes('rebase')) {
            issues.push({
                level: 'error',
                message: 'Merge/rebase in progress. Resolve conflicts first.',
                blocking: true
            });
        }

        // 6. Protected branch check
        const protectedBranches = ['main', 'master', 'production'];
        if (protectedBranches.includes(branch)) {
            issues.push({
                level: 'warning',
                message: `Working on protected branch "${branch}". Consider creating a feature branch.`
            });
        }

        const hasBlockingIssues = issues.some(i => i.blocking);

        return {
            safe: !hasBlockingIssues,
            issues,
            branch
        };
    }

    /**
     * Display issues to user
     */
    displayIssues(issues) {
        for (const issue of issues) {
            const icon = {
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            }[issue.level];

            console.log(`${icon} ${issue.message}`);

            if (issue.files) {
                issue.files.slice(0, 5).forEach(f => {
                    console.log(`  ${f.status} ${f.file}`);
                });
                if (issue.files.length > 5) {
                    console.log(`  ... and ${issue.files.length - 5} more`);
                }
            }
        }
    }
}
```

### Safe Execution Wrapper

```javascript
async function executeWithGitSafety(operation, options = {}) {
    const safety = new GitSafetyManager(process.cwd());
    const check = await safety.performSafetyCheck();

    // Display issues
    if (check.issues.length > 0) {
        console.log('\n🔍 Git Safety Check:\n');
        safety.displayIssues(check.issues);
        console.log();
    }

    // Block if unsafe
    if (!check.safe) {
        console.error('❌ Cannot proceed due to blocking issues.');
        process.exit(1);
    }

    // Warn and confirm
    const warnings = check.issues.filter(i => i.level === 'warning');
    if (warnings.length > 0 && !options.skipPrompts) {
        const {confirm} = require('@inquirer/prompts');
        const proceed = await confirm({
            message: 'Warnings detected. Continue anyway?',
            default: false
        });

        if (!proceed) {
            console.log('Operation cancelled.');
            process.exit(0);
        }
    }

    // Execute operation
    return await operation();
}
```

---

## CLI Command Integration

### Adding Git Options to Commands

```javascript
// Extend CLI commands with git options
program
    .command('create integration <name>')
    .option('--no-git', 'Skip all git operations')
    .option('--no-commit', 'Skip automatic commit')
    .option('--branch <name>', 'Create and use feature branch')
    .option('--commit-message <message>', 'Custom commit message')
    .action(async (name, options) => {
        // Git safety check
        if (options.git !== false) {
            await executeWithGitSafety(async () => {
                // Create integration...
                const files = await createIntegration(name, options);

                // Git operations
                const git = new Git();

                // Optional: Create branch
                if (options.branch) {
                    git.createBranch(options.branch);
                }

                // Optional: Commit
                if (options.commit !== false) {
                    git.add(files);
                    const message = options.commitMessage ||
                        `feat(frigg): add ${name} integration`;
                    git.commit(message);
                    console.log(`✅ Committed to ${git.getBranch()}`);
                }
            });
        }
    });
```

---

## Summary

### Git Integration Features

1. **Detection** - Automatically detect git repositories
2. **Safety Checks** - Warn about uncommitted changes, conflicts
3. **Branch Management** - Create feature branches for changes
4. **Automatic Commits** - Smart commit messages with metadata
5. **Interactive Options** - Let users customize git behavior
6. **Rollback Support** - Git-based rollback for clean undo
7. **Edge Case Handling** - Handle detached HEAD, protected branches, conflicts

### Recommended Workflow

```bash
# User runs CLI command
frigg create integration my-integration

# CLI:
1. ✅ Checks git status
2. ⚠️  Warns if uncommitted changes
3. 🌿 Offers to create feature branch
4. 📝 Creates integration files
5. 🔍 Shows modified files
6. 💾 Commits with message: "feat(frigg): add my-integration integration"
7. ✅ Done! Ready to push
```

### Flags for Control

```bash
# Skip all git operations
frigg create integration my-integration --no-git

# Skip commit but do safety checks
frigg create integration my-integration --no-commit

# Create on feature branch
frigg create integration my-integration --branch feature/my-integration

# Custom commit message
frigg create integration my-integration --commit-message "Add new integration"
```

---

*This git integration ensures the Frigg CLI works harmoniously with git workflows while providing safety and flexibility.*
