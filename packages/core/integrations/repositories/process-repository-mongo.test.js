const { ProcessRepositoryMongo } = require('./process-repository-mongo');

describe('ProcessRepositoryMongo.applyProcessUpdate', () => {
    it('stamps updatedAt as an extended-JSON $date so Mongo stores a BSON date', async () => {
        const repo = new ProcessRepositoryMongo();
        const calls = [];
        repo.prisma = {
            $runCommandRaw: jest.fn(async (command) => {
                calls.push(command);
                return { value: null };
            }),
        };

        await repo.applyProcessUpdate('507f1f77bcf86cd799439011', {
            set: { 'context.foo': 'bar' },
        });

        const { updatedAt } = calls[0].update.$set;
        expect(updatedAt).not.toBeInstanceOf(Date);
        expect(Object.keys(updatedAt)).toEqual(['$date']);
        expect(new Date(updatedAt.$date).toISOString()).toBe(updatedAt.$date);
    });
});
