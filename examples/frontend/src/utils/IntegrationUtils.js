// class to wrap the response of the /api/integrations endpoint
// and provide helper methods from that data.

const ENTITIES = 'entities';
const INTEGRATIONS = 'integrations';
const PRIMARY = 'primary';
const AUTHORIZED = 'authorized';
const OPTIONS = 'options';

export default class IntegrationUtils {
	constructor(integrations) {
		this.integrations = integrations;
	}

	//
	// return a list of objects containing data related to the possible
	// new integrations you may connect
	getPossibleIntegrations() {
		const options = this.integrations[ENTITIES][OPTIONS];

		// exclude the primary
		const possibleOptions = [];
		options.forEach((opt) => {
			if (opt.type !== this.getPrimaryType()) {
				// opt.connected = false;
				possibleOptions.push(opt);
			}
		});

		return possibleOptions;
	}

	//
	// get entities primary type (a string, ie: "Freshbooks")
	getPrimaryType() {
		// console.log(JSON.stringify(this.integrations));
		return this.integrations[ENTITIES][PRIMARY];
	}

	//
	// get a list of authorized entities
	getAuthorizedEntities() {
		return this.integrations[ENTITIES][AUTHORIZED];
	}

	getDisplayDataForType(type) {
		const possibleIntegrations = this.getPossibleIntegrations();
		const integration = possibleIntegrations.find((pi) => pi.type === type);

		if (integration) {
			return integration.display;
		}

		throw Error(`getDisplayForType() ERR - type ${type} does not exist in possible integrations!`);
	}

	getTypeForId(entityId) {
		const authorizedEntities = this.getAuthorizedEntities();
		const entity = authorizedEntities.find((ae) => ae.id === entityId);

		if (entity) {
			return entity.type;
		}

		throw Error(`getTypeForId() ERR - entityId ${entityId} does not exist in authorized entities!`);
	}

	//
	// return a list of objects containing data related to the active/existing user integrations
	getActiveIntegrations() {
		const activeIntegrations = [];
		const integrations = this.integrations[INTEGRATIONS];
		integrations.forEach((integration) => {
			const clone = { ...integration };
			const secondaryId = clone.entities[1].id; // get 2nd element
			const type = this.getTypeForId(secondaryId);
			clone.type = type;
			clone.display = this.getDisplayDataForType(type);
			// clone.connected = true;
			// clone['secondaryId'] = secondaryId;
			activeIntegrations.push(clone);
		});

		return activeIntegrations;
	}

	getActiveAndPossibleIntegrationsCombined() {
		const combinedIntegrations = [];
		const activeIntegrations = this.getActiveIntegrations();
		const possibleIntegrations = this.getPossibleIntegrations();

		possibleIntegrations.forEach((integration) => {
			const foundActive = activeIntegrations.filter((ai) => ai.type === integration.type);
			if (foundActive.length > 0) {
				foundActive.forEach((ai) => {
					combinedIntegrations.push(ai);
				});
			} else {
				combinedIntegrations.push(integration);
			}
		});

		return combinedIntegrations;
	}
}
