const { IntegrationsReport } = require('./reports/integrations-report');

// Registered by the admin-scripts bootstrap when the app definition sets `admin.includeBuiltinReports`.
const BUILTIN_REPORTS = [IntegrationsReport];

module.exports = { BUILTIN_REPORTS };
