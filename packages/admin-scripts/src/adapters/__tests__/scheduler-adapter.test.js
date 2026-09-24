const { SchedulerAdapter } = require('../scheduler-adapter');

describe('SchedulerAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new SchedulerAdapter();
    });

    describe('Abstract base class', () => {
        it('should throw error for getName()', () => {
            expect(() => adapter.getName()).toThrow(
                'SchedulerAdapter.getName() must be implemented'
            );
        });

        it('should throw error for createSchedule()', async () => {
            await expect(adapter.createSchedule({})).rejects.toThrow(
                'SchedulerAdapter.createSchedule() must be implemented'
            );
        });

        it('should throw error for deleteSchedule()', async () => {
            await expect(adapter.deleteSchedule('test')).rejects.toThrow(
                'SchedulerAdapter.deleteSchedule() must be implemented'
            );
        });

        it('should throw error for setScheduleEnabled()', async () => {
            await expect(
                adapter.setScheduleEnabled('test', true)
            ).rejects.toThrow(
                'SchedulerAdapter.setScheduleEnabled() must be implemented'
            );
        });

        it('should throw error for listSchedules()', async () => {
            await expect(adapter.listSchedules()).rejects.toThrow(
                'SchedulerAdapter.listSchedules() must be implemented'
            );
        });

        it('should throw error for getSchedule()', async () => {
            await expect(adapter.getSchedule('test')).rejects.toThrow(
                'SchedulerAdapter.getSchedule() must be implemented'
            );
        });
    });

    describe('Inheritance', () => {
        it('should be extendable by concrete implementations', () => {
            class TestSchedulerAdapter extends SchedulerAdapter {
                getName() {
                    return 'test-adapter';
                }

                async createSchedule(config) {
                    return { scheduleName: config.scriptName };
                }

                async deleteSchedule(scriptName) {
                    return;
                }

                async setScheduleEnabled(scriptName, enabled) {
                    return;
                }

                async listSchedules() {
                    return [];
                }

                async getSchedule(scriptName) {
                    return { scriptName };
                }
            }

            const testAdapter = new TestSchedulerAdapter();

            expect(testAdapter).toBeInstanceOf(SchedulerAdapter);
            expect(testAdapter.getName()).toBe('test-adapter');
        });

        it('should require all abstract methods to be implemented', async () => {
            class IncompleteAdapter extends SchedulerAdapter {
                getName() {
                    return 'incomplete';
                }
                // Missing other methods
            }

            const incomplete = new IncompleteAdapter();

            // Should work for implemented method
            expect(incomplete.getName()).toBe('incomplete');

            // Should throw for missing methods
            await expect(incomplete.createSchedule({})).rejects.toThrow();
            await expect(incomplete.deleteSchedule('test')).rejects.toThrow();
            await expect(
                incomplete.setScheduleEnabled('test', true)
            ).rejects.toThrow();
            await expect(incomplete.listSchedules()).rejects.toThrow();
            await expect(incomplete.getSchedule('test')).rejects.toThrow();
        });
    });
});
