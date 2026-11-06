class AdminScriptBase {
    static Definition = {
        name: 'Script Name',
        version: '0.0.0',
        description: 'What this script does',
        source: 'USER_DEFINED', // 'BUILTIN' | 'USER_DEFINED'

        inputSchema: null,
        outputSchema: null,

        config: {
            timeout: 300000,
            requireIntegrationInstance: false,
        },

        display: {
            category: 'maintenance',
            icon: null,
        },
    };

    constructor(params = {}) {
        this.context = params.context || null;
        this.executionId = params.executionId || null;
        this.integrationFactory = params.integrationFactory || null;
    }

    async execute(params) {
        throw new Error(
            'AdminScriptBase.execute() must be implemented by subclass'
        );
    }
}

module.exports = { AdminScriptBase };
