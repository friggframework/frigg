/**
 * Schedule Management Use Cases
 *
 * Separated by Single Responsibility Principle:
 * - GetEffectiveScheduleUseCase: Read schedule with priority resolution
 * - UpsertScheduleUseCase: Create/update schedule with scheduler sync
 * - DeleteScheduleUseCase: Delete schedule with scheduler cleanup
 */

const {
    GetEffectiveScheduleUseCase,
} = require('./get-effective-schedule-use-case');
const { UpsertScheduleUseCase } = require('./upsert-schedule-use-case');
const { DeleteScheduleUseCase } = require('./delete-schedule-use-case');

module.exports = {
    GetEffectiveScheduleUseCase,
    UpsertScheduleUseCase,
    DeleteScheduleUseCase,
};
