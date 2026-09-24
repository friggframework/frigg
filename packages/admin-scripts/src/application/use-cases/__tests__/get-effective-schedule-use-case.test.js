const {
    GetEffectiveScheduleUseCase,
} = require('../get-effective-schedule-use-case');

describe('GetEffectiveScheduleUseCase', () => {
    let useCase;
    let mockCommands;
    let mockScriptFactory;

    beforeEach(() => {
        mockCommands = {
            getScheduleByScriptName: jest.fn(),
        };

        mockScriptFactory = {
            has: jest.fn(),
            get: jest.fn(),
        };

        useCase = new GetEffectiveScheduleUseCase({
            commands: mockCommands,
            scriptFactory: mockScriptFactory,
        });
    });

    describe('execute', () => {
        it('should return database schedule when override exists', async () => {
            const dbSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 9 * * *',
                timezone: 'UTC',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.getScheduleByScriptName.mockResolvedValue(dbSchedule);

            const result = await useCase.execute('test-script');

            expect(result.source).toBe('database');
            expect(result.schedule).toEqual(dbSchedule);
        });

        it('should return none when no schedule configured', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.execute('test-script');

            expect(result.source).toBe('none');
            expect(result.schedule.enabled).toBe(false);
            expect(result.schedule.scriptName).toBe('test-script');
        });

        it('ignores any schedule declared in the Definition (DB override is the only source)', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: {
                    schedule: { enabled: true, cronExpression: '0 12 * * *' },
                },
            });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.execute('test-script');

            expect(result.source).toBe('none');
            expect(result.schedule.enabled).toBe(false);
        });

        it('should throw SCRIPT_NOT_FOUND error when script does not exist', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.execute('non-existent')).rejects.toThrow(
                'Script "non-existent" not found'
            );

            try {
                await useCase.execute('non-existent');
            } catch (error) {
                expect(error.output.statusCode).toBe(404);
            }
        });
    });
});
