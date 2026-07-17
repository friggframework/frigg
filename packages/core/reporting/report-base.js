/**
 * ReportBase — a report is an admin operation whose output is its payload.
 *
 * A report Definition declares:
 *   - runModes: allowed modes; the first is the default.
 *       'live'     — compute and return inline; persist nothing.
 *       'recorded' — persist an execution record (input + results + logs).
 *       'snapshot' — a recorded run tagged as a point in a named series.
 *   - output.format: 'json' returns inline; 'csv'|'pdf'|'zip' go to artifact storage.
 *   - schedule: optional recurring run via EventBridge.
 *
 * execute(frigg, params): `frigg` is the admin command bundle
 * (=== this.context.commands); do data reads through it, never a repository.
 */
class ReportBase {
    static Definition = {
        name: 'Report Name',
        version: '0.0.0',
        description: 'What this report computes',
        source: 'USER_DEFINED', // 'BUILTIN' | 'USER_DEFINED'

        runModes: ['live', 'recorded', 'snapshot'],
        inputSchema: null,
        outputSchema: null,
        output: { format: 'json' },
        schedule: { enabled: false, cron: null, mode: 'snapshot' },

        config: {
            timeout: 300000,
        },

        display: {
            category: 'reporting',
            icon: null,
        },
    };

    constructor(params = {}) {
        this.context = params.context || null;
        this.executionId = params.executionId || null;
        this.integrationFactory = params.integrationFactory || null;
    }

    async execute(frigg, params) {
        throw new Error('ReportBase.execute() must be implemented by subclass');
    }
}

module.exports = { ReportBase };
