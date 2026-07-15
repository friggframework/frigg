/**
 * ReportBase — a report is an admin operation whose output is its payload.
 *
 * Mirrors AdminScriptBase (packages/admin-scripts) so reports and scripts share
 * one mental model and one runner. Lives in core (not admin-scripts) because
 * core ships built-in reports that import this; admin-scripts depends on core,
 * never the reverse.
 *
 * A report Definition adds three fields on top of the script shape:
 *   - runModes: allowed run modes; the first is the default.
 *       'live'     — compute and return inline; persist nothing.
 *       'recorded' — persist an execution record (input + results + logs).
 *       'snapshot' — a recorded run tagged as a point in a named series.
 *   - output.format: 'json' inline; 'csv'|'pdf'|'zip' go to artifact storage.
 *   - schedule: optional recurring run (activated at runtime, EventBridge).
 *
 * execute(frigg, params) receives the admin command bundle as `frigg`
 * (=== this.context.commands) and returns a structured payload. Data reads go
 * through `frigg` only — never a repository directly.
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
