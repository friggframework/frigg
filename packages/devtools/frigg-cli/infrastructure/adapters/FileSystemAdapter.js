const fs = require('fs-extra');
const path = require('path');

/**
 * FileSystemAdapter
 * Low-level file system operations with atomic write/update and rollback support
 */
class FileSystemAdapter {
    constructor() {
        this.operations = []; // Track operations for rollback
    }

    /**
     * Write file atomically (temp file + rename)
     */
    async writeFile(filePath, content) {
        const tempPath = `${filePath}.tmp.${Date.now()}`;

        try {
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, filePath);

            this.operations.push({
                type: 'create',
                path: filePath,
                backup: null
            });

            return {success: true, path: filePath};
        } catch (error) {
            // Clean up temp file on error
            if (await fs.pathExists(tempPath)) {
                await fs.unlink(tempPath);
            }
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Update file atomically (backup + write + rename)
     */
    async updateFile(filePath, updateFn) {
        const backupPath = `${filePath}.backup.${Date.now()}`;

        try {
            // Create backup if file exists
            if (await fs.pathExists(filePath)) {
                await fs.copy(filePath, backupPath);
            }

            // Read current content
            const currentContent = await fs.pathExists(filePath)
                ? await fs.readFile(filePath, 'utf-8')
                : '';

            // Apply update function
            const newContent = await updateFn(currentContent);

            // Write to temp, then rename (atomic)
            const tempPath = `${filePath}.tmp.${Date.now()}`;
            await fs.writeFile(tempPath, newContent, 'utf-8');
            await fs.rename(tempPath, filePath);

            this.operations.push({
                type: 'update',
                path: filePath,
                backup: backupPath
            });

            return {success: true, path: filePath};
        } catch (error) {
            // Restore from backup on error
            if (await fs.pathExists(backupPath)) {
                await fs.copy(backupPath, filePath);
            }
            throw new Error(`Failed to update file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Read file content
     */
    async readFile(filePath) {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Check if file or directory exists
     */
    async exists(filePath) {
        return await fs.pathExists(filePath);
    }

    /**
     * Ensure directory exists (create if needed)
     */
    async ensureDirectory(dirPath) {
        if (!await fs.pathExists(dirPath)) {
            await fs.ensureDir(dirPath);

            this.operations.push({
                type: 'mkdir',
                path: dirPath,
                backup: null
            });
        }

        return {exists: true};
    }

    /**
     * List directories in a path
     */
    async listDirectories(dirPath) {
        if (!await fs.pathExists(dirPath)) {
            return [];
        }

        const entries = await fs.readdir(dirPath, {withFileTypes: true});
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    }

    /**
     * List files in a path (optionally with pattern)
     */
    async listFiles(dirPath, pattern = null) {
        if (!await fs.pathExists(dirPath)) {
            return [];
        }

        const entries = await fs.readdir(dirPath, {withFileTypes: true});
        let files = entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name);

        // Apply pattern filter if provided
        if (pattern) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            files = files.filter(file => regex.test(file));
        }

        return files;
    }


    /**
     * Rollback all tracked operations in reverse order
     */
    async rollback() {
        const errors = [];

        // Reverse order for rollback
        for (const op of this.operations.reverse()) {
            try {
                switch (op.type) {
                    case 'create':
                        // Delete created file
                        if (await fs.pathExists(op.path)) {
                            await fs.unlink(op.path);
                        }
                        break;

                    case 'update':
                        // Restore from backup
                        if (op.backup && await fs.pathExists(op.backup)) {
                            await fs.copy(op.backup, op.path);
                        }
                        break;

                    case 'mkdir':
                        // Remove empty directory
                        if (await fs.pathExists(op.path)) {
                            const files = await fs.readdir(op.path);
                            if (files.length === 0) {
                                await fs.rmdir(op.path);
                            }
                        }
                        break;
                }
            } catch (error) {
                errors.push({
                    operation: op,
                    error: error.message
                });
            }
        }

        this.operations = [];

        return {
            success: errors.length === 0,
            errors
        };
    }

    /**
     * Commit operations (clean up backups)
     */
    async commit() {
        for (const op of this.operations) {
            if (op.backup && await fs.pathExists(op.backup)) {
                await fs.unlink(op.backup);
            }
        }

        this.operations = [];
        return {success: true};
    }

    /**
     * Clear operation tracking without cleanup
     */
    clear() {
        this.operations = [];
    }
}

module.exports = {FileSystemAdapter};
