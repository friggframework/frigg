const { GetEffectiveScheduleUseCase } = require('../get-effective-schedule-use-case');

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

        it('should return definition schedule when no database override', async () => {
            const definitionSchedule = {
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'America/New_York',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: { schedule: definitionSchedule },
            });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.execute('test-script');

            expect(result.source).toBe('definition');
            expect(result.schedule.enabled).toBe(true);
            expect(result.schedule.cronExpression).toBe('0 12 * * *');
            expect(result.schedule.timezone).toBe('America/New_York');
        });

        it('should default timezone to UTC when not specified in definition', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: { schedule: { enabled: true, cronExpression: '0 12 * * *' } },
            });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.execute('test-script');

            expect(result.schedule.timezone).toBe('UTC');
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

        it('should return none when definition schedule is disabled', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: { schedule: { enabled: false } },
            });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.execute('test-script');

            expect(result.source).toBe('none');
            expect(result.schedule.enabled).toBe(false);
        });

        it('should throw SCRIPT_NOT_FOUND error when script does not exist', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.execute('non-existent'))
                .rejects.toThrow('Script "non-existent" not found');

            try {
                await useCase.execute('non-existent');
            } catch (error) {
                expect(error.code).toBe('SCRIPT_NOT_FOUND');
            }
        });
    });
});
