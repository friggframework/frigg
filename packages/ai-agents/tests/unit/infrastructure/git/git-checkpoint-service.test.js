const { GitCheckpointService } = require('../../../../src/infrastructure/git/git-checkpoint-service');

describe('GitCheckpointService', () => {
    let service;
    let mockExec;

    beforeEach(() => {
        mockExec = jest.fn();
        service = new GitCheckpointService({ execCommand: mockExec });
    });

    describe('createCheckpoint', () => {
        it('should create checkpoint with commit hash', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123def456\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Before HubSpot integration');

            expect(checkpoint).toHaveProperty('id');
            expect(checkpoint).toHaveProperty('hash');
            expect(checkpoint).toHaveProperty('message');
            expect(checkpoint).toHaveProperty('timestamp');
            expect(checkpoint.message).toBe('Before HubSpot integration');
        });

        it('should store checkpoint in registry', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123def456\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Test checkpoint');
            const stored = service.getCheckpoint(checkpoint.id);

            expect(stored).toBeDefined();
            expect(stored.hash).toBe(checkpoint.hash);
        });

        it('should handle dirty working directory', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });
            mockExec.mockResolvedValueOnce({ stdout: 'M src/file.js\n' });

            const checkpoint = await service.createCheckpoint('Checkpoint with changes');

            expect(checkpoint).toHaveProperty('hasPendingChanges', true);
        });
    });

    describe('rollback', () => {
        it('should rollback to checkpoint', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Before changes');

            mockExec.mockResolvedValueOnce({ stdout: '' });

            const result = await service.rollback(checkpoint.id);

            expect(result.success).toBe(true);
            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git reset'));
        });

        it('should fail for unknown checkpoint', async () => {
            await expect(service.rollback('unknown-id')).rejects.toThrow('Checkpoint not found');
        });

        it('should support soft rollback', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Test');

            mockExec.mockResolvedValueOnce({ stdout: '' });

            await service.rollback(checkpoint.id, { mode: 'soft' });

            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--soft'));
        });

        it('should support hard rollback', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Test');

            mockExec.mockResolvedValueOnce({ stdout: '' });

            await service.rollback(checkpoint.id, { mode: 'hard' });

            expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--hard'));
        });
    });

    describe('listCheckpoints', () => {
        it('should return all checkpoints', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'def\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            await service.createCheckpoint('First');
            await service.createCheckpoint('Second');

            const checkpoints = service.listCheckpoints();

            expect(checkpoints.length).toBe(2);
        });

        it('should return checkpoints in reverse chronological order', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            await service.createCheckpoint('First');

            await new Promise(r => setTimeout(r, 10));

            mockExec.mockResolvedValueOnce({ stdout: 'def\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            await service.createCheckpoint('Second');

            const checkpoints = service.listCheckpoints();

            expect(checkpoints[0].message).toBe('Second');
        });
    });

    describe('getStatus', () => {
        it('should return current git status', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'feature-branch\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });

            const status = await service.getStatus();

            expect(status).toHaveProperty('branch');
            expect(status).toHaveProperty('clean');
            expect(status).toHaveProperty('hash');
        });

        it('should detect uncommitted changes', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'main\n' });
            mockExec.mockResolvedValueOnce({ stdout: 'M src/file.js\n?? new-file.js\n' });
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });

            const status = await service.getStatus();

            expect(status.clean).toBe(false);
            expect(status.changes).toHaveLength(2);
        });
    });

    describe('diff', () => {
        it('should show diff since checkpoint', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'abc123\n' });
            mockExec.mockResolvedValueOnce({ stdout: '' });

            const checkpoint = await service.createCheckpoint('Before');

            mockExec.mockResolvedValueOnce({ stdout: '+ added line\n- removed line\n' });

            const diff = await service.diff(checkpoint.id);

            expect(diff).toContain('added line');
        });
    });

    describe('cleanup', () => {
        it('should remove old checkpoints', async () => {
            for (let i = 0; i < 15; i++) {
                mockExec.mockResolvedValueOnce({ stdout: `abc${i}\n` });
                mockExec.mockResolvedValueOnce({ stdout: '' });
                await service.createCheckpoint(`Checkpoint ${i}`);
            }

            expect(service.listCheckpoints().length).toBe(15);

            service.cleanup({ maxCheckpoints: 10 });

            expect(service.listCheckpoints().length).toBe(10);
        });
    });
});
