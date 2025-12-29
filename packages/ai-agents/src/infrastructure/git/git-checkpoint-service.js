const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class GitCheckpointService {
    constructor(options = {}) {
        this.execCommand = options.execCommand || this._execGit.bind(this);
        this.workingDir = options.workingDir || process.cwd();
        this.checkpoints = new Map();
    }

    async _execGit(command) {
        return execAsync(command, { cwd: this.workingDir });
    }

    async createCheckpoint(message) {
        const hashResult = await this.execCommand('git rev-parse HEAD');
        const hash = hashResult.stdout.trim();

        const statusResult = await this.execCommand('git status --porcelain');
        const hasPendingChanges = statusResult.stdout.trim().length > 0;

        const id = `checkpoint-${Date.now()}-${hash.substring(0, 8)}`;

        const checkpoint = {
            id,
            hash,
            message,
            timestamp: new Date(),
            hasPendingChanges
        };

        this.checkpoints.set(id, checkpoint);

        return checkpoint;
    }

    getCheckpoint(id) {
        return this.checkpoints.get(id);
    }

    async rollback(checkpointId, options = {}) {
        const checkpoint = this.checkpoints.get(checkpointId);

        if (!checkpoint) {
            throw new Error('Checkpoint not found');
        }

        const { mode = 'mixed' } = options;
        const modeFlag = mode === 'hard' ? '--hard' : mode === 'soft' ? '--soft' : '--mixed';

        await this.execCommand(`git reset ${modeFlag} ${checkpoint.hash}`);

        return { success: true, checkpoint };
    }

    listCheckpoints() {
        const list = Array.from(this.checkpoints.values());
        return list.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getStatus() {
        const branchResult = await this.execCommand('git rev-parse --abbrev-ref HEAD');
        const branch = branchResult.stdout.trim();

        const statusResult = await this.execCommand('git status --porcelain');
        const statusLines = statusResult.stdout.trim();
        const changes = statusLines ? statusLines.split('\n').map(line => ({
            status: line.substring(0, 2).trim(),
            file: line.substring(3)
        })) : [];

        const hashResult = await this.execCommand('git rev-parse --short HEAD');
        const hash = hashResult.stdout.trim();

        return {
            branch,
            hash,
            clean: changes.length === 0,
            changes
        };
    }

    async diff(checkpointId) {
        const checkpoint = this.checkpoints.get(checkpointId);

        if (!checkpoint) {
            throw new Error('Checkpoint not found');
        }

        const result = await this.execCommand(`git diff ${checkpoint.hash}`);
        return result.stdout;
    }

    cleanup(options = {}) {
        const { maxCheckpoints = 50 } = options;

        const sorted = this.listCheckpoints();

        if (sorted.length > maxCheckpoints) {
            const toRemove = sorted.slice(maxCheckpoints);
            for (const checkpoint of toRemove) {
                this.checkpoints.delete(checkpoint.id);
            }
        }
    }
}

module.exports = { GitCheckpointService };
