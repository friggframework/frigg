const { createReportingRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');

const router = createReportingRouter();

// true → eager-connect Prisma; the reporting endpoints read the DB.
const handler = createAppHandler('HTTP Event: Reporting', router, true);

module.exports = { handler, router };
