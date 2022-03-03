const LHDelegate = require('../LHDelegate');
const Integration = require('../models/Integration');
const Entity = require('../models/Entity');
const EntityManager = require('../../managers/entities/EntityManager');
const Credential = require('../models/Credential');

class LHIntegrationManager extends LHDelegate {
	static Config = {
		name: 'Integration Name',
		version: '0.0.0', // Integration Version, used for migration and storage purposes, as well as display
		supportedVersions: [], // Eventually usable for deprecation and future test version purposes

		// an array of events that are process(able) by this Integration
		events: [],
	};

	constructor(params) {
		super(params);
		this.integrationMO = new Integration();
	}

	static getName() {
		return this.Config.name;
	}

	static getCurrentVersion() {
		return this.Config.version;
	}

	async validateConfig() {
		const configOptions = await this.getConfigOptions();
		const currentConfig = this.integration.config;
		let needsConfig = false;
		for (const option of configOptions) {
			if (option.required) {
				// For now, just make sure the key exists. We should add more dynamic/better validation later.
				if (!Object.prototype.hasOwnProperty.call(currentConfig, option.key)) {
					needsConfig = true;
					this.integration.messages.warnings.push({
						title: 'Config Validation Error',
						message: `Missing required field of ${option.label}`,
						timestamp: Date.now(),
					});
				}
			}
		}
		if (needsConfig) {
			this.integration.status = 'NEEDS_CONFIG';
			await this.integration.save();
		}
	}

	async testAuth() {
		let didAuthPass = true;

		try {
			await this.primaryInstance.testAuth();
		} catch {
			didAuthPass = false;
			this.integration.messages.errors.push({
				title: 'Authentication Error',
				message: `There was an error with your ${this.primaryInstance.constructor.getName()} Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
				timestamp: Date.now(),
			});
		}

		try {
			await this.targetInstance.testAuth();
		} catch {
			didAuthPass = false;
			this.integration.messages.errors.push({
				title: 'Authentication Error',
				message: `There was an error with your ${this.targetInstance.constructor.getName()} Entity.
            Please reconnect/re-authenticate, or reach out to Support for assistance.`,
				timestamp: Date.now(),
			});
		}

		if (!didAuthPass) {
			this.integration.status = 'ERROR';
			this.integration.markModified('messages.error');
			await this.integration.save();
		}
	}

	static async getInstance(params) {
		const instance = new this(params);

		params.delegate = instance;
		instance.delegateTypes.push(...this.Config.events);
		return new this(params);
	}

	static getIntegrationManagerClasses(type = '') {
		const normalizedType = type.toLowerCase();
		const integrationManagerIndex = this.integrationTypes.indexOf(normalizedType);
		const integrationManagerClass = this.integrationManagerClasses[integrationManagerIndex];

		if (!integrationManagerClass) {
			throw new Error(`Could not find integration manager for type "${type}"`);
		}

		return integrationManagerClass;
	}

	// Takes entities, User, and Config, and returns an Instance of the IntegrationManager
	static async createIntegration(entities, userId, config) {
		// verify entity ids belong to the user
		const entityMO = new Entity();

		for (const id of entities) {
			const entity = await entityMO.get(id);

			if (!entity) {
				throw new Error(`Entity with ID ${id} does not exist.`);
			}

			if (entity.user.toString() !== userId.toString()) {
				throw new Error('one or more the entities do not belong to the user');
			}
		}

		// build integration
		const integrationManagerClass = this.getIntegrationManagerClasses(config.type);
		const integrationMO = new Integration();
		const integration = await integrationMO.create({
			entities: entities,
			user: userId,
			config,
			version: integrationManagerClass.Config.version,
		});

		const instance = await integrationManagerClass.getInstance({
			userId,
			integrationId: integration.id,
		});
		instance.integration = integration;
		instance.delegateTypes.push(...integrationManagerClass.Config.events);

		// Need to get special primaryInstance because it has an extra param to pass in
		instance.primaryInstance = await EntityManager.getEntityManagerInstanceFromEntityId(
			instance.integration.entities[0],
			instance.integration.user
		);
		// Now we can use the general ManagerGetter
		instance.targetInstance = await EntityManager.getEntityManagerInstanceFromEntityId(
			instance.integration.entities[1],
			instance.integration.user
		);

		instance.delegate = instance;

		return instance;
	}

	static async getFormattedIntegration(integration) {
		const entityMO = new Entity();
		const integrationObj = {
			id: integration.id,
			status: integration.status,
			config: integration.config,
			entities: [],
			version: integration.version,
			messages: integration.messages,
		};
		for (const entityId of integration.entities) {
			// Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
			const entity = await entityMO.get(
				entityId,
				'-dateCreated -dateUpdated -user -credentials -credential -_id -__t -__v',
				{ lean: true }
			);
			integrationObj.entities.push({
				id: entityId,
				...entity,
			});
		}
		return integrationObj;
	}

	static async getIntegrationsForUserId(userId) {
		const integrationMO = new Integration();

		const integrationList = await integrationMO.list({ user: userId });

		const entityMO = new Entity();

		const responseArray = [];
		for (const integration of integrationList) {
			const integrationObj = await LHIntegrationManager.getFormattedIntegration(integration);
			responseArray.push(integrationObj);
		}
		return responseArray;
	}

	static async getIntegrationForUserById(userId, integrationId) {
		const integrationMO = new Integration();

		const integrationList = await integrationMO.list({
			user: userId,
			_id: integrationId,
		});

		return integrationList[0];
	}

	static async deleteIntegrationForUserById(userId, integrationId) {
		const integrationMO = new Integration();

		const integrationList = await integrationMO.list({
			user: userId,
			_id: integrationId,
		});
		if (integrationList.length == 1) {
			await integrationMO.delete(integrationId);
		} else {
			throw new Error(`Integration with id of ${integrationId} does not exist for this user`);
		}
	}

	static async getIntegrationById(id) {
		const integrationMO = new Integration();
		return await integrationMO.get(id);
	}

	static async getFilteredIntegrationsForUserId(userId, filter) {
		const integrationMO = new Integration();

		const integrationList = await integrationMO.list({
			user: userId,
			...filter,
		});

		return integrationList;
	}

	static async getCredentialById(credential_id) {
		const credentialMO = new Credential();
		return credentialMO.get(credential_id);
	}

	static async listCredentials(options) {
		const credentialMO = new Credential();
		return credentialMO.list(options);
	}

	static async getEntityById(entity_id) {
		const entityMO = new Entity();
		return entityMO.get(entity_id);
	}

	static async listEntities(options) {
		const entityMO = new Entity();
		return entityMO.list(options);
	}

	static async getInstanceFromIntegrationId(params) {
		const { integrationId } = params;
		const integration = await this.getIntegrationById(integrationId);
		const userId = integration.user;

		const instance = await this.getInstance({ userId, integrationId });
		instance.integration = integration;

		instance.primaryInstance = await EntityManager.getEntityManagerInstanceFromEntityId(
			instance.integration.entities[0],
			instance.integration.user
		);

		instance.targetInstance = await EntityManager.getEntityManagerInstanceFromEntityId(
			instance.integration.entities[1],
			instance.integration.user
		);

		return instance;
	}

	// Children must implement
	async processCreate() {
		throw new Error('processCreate method not implemented in child Manager');
	}

	async processDelete() {
		throw new Error('processDelete method not implemented in child Manager');
	}

	async processUpdate() {
		throw new Error('processUpdate method not implemented in child Manager');
	}

	async getConfigOptions() {
		throw new Error('getConfigOptions method not implemented in child Manager');
	}

	async getSampleData() {
		throw new Error('getSampleData method not implemented in child Manager');
	}
}

module.exports = LHIntegrationManager;
