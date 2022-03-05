const LHIntegrationManager = require('../../base/managers/LHIntegrationManager');
const { debug } = require('../../utils/logger');

class AttentiveIntegrationManager extends LHIntegrationManager {
	static Config = {
		name: 'attentive',
		version: '1.0.0',
		supportedVersions: ['1.0.0'],
		events: ['EXAMPLE_EVENT'],
	};

	constructor(params) {
		super(params);
	}

	/**
	 * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
	 */
	async processCreate(params) {
		// Validate that we have all of the data we need
		// Set integration status as makes sense. Default ENABLED
		debug('processCreate() called on the Attentive Manager');
		// TODO turn this into a validateConfig method/function
		this.integration.status = 'NEEDS_CONFIG';
		await this.integration.save();
	}

	async processDelete(params) {
		debug('processDelete() called on the Attentive Manager');
	}

	async getSampleData() {
		const samepleResponse = await this.targetInstance.api.getTokenIdentity();
		return { data: samepleResponse };
	}
}

module.exports = AttentiveIntegrationManager;
