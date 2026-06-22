const { createReportingRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');

const router = createReportingRouter();

// shouldUseDatabase = true: the reporting endpoints read the DB, so eager-connect
// Prisma in the handler wrapper.
const handler = createAppHandler('HTTP Event: Reporting', router, true);

module.exports = { handler, router };
