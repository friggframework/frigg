const { IntegrationsReport } = require('./reports/integrations-report');

/**
 * Reports that core ships. Registered by the admin-scripts bootstrap when the
 * app definition sets `admin.includeBuiltinReports`. Adopters add their own via
 * the `reports: []` array in the app definition.
 */
const BUILTIN_REPORTS = [IntegrationsReport];

module.exports = { BUILTIN_REPORTS };
