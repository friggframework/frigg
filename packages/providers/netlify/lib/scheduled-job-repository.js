/**
 * Scheduled Job Repository
 *
 * Lives in core (infrastructure/scheduler/scheduled-job-repository.js) next to
 * the NetlifySchedulerAdapter and the ScheduledJob model, so core's scheduler
 * factory can build it without depending on this package. Re-exported here
 * for existing imports.
 */
module.exports = require('@friggframework/core/infrastructure/scheduler/scheduled-job-repository');
