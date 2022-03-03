const LHBaseClass = require('../../LHBaseClass');
const LHModuleManager = require('../../managers/LHModuleManager');
const { RequiredPropertyError } = require('../../../errors/ValidationErrors');

class Options extends LHBaseClass {
	constructor(params) {
		super(params);

		this.module = this.getParamAndVerifyType(params, 'module', LHModuleManager);
		this.integrations = this.getParamAndVerifyType(params, 'integrations', LHModuleManager);
		this.isMany = Boolean(this.getParam(params, 'isMany', false));
		this.hasUserConfig = Boolean(this.getParam(params, 'hasUserConfig', false));
		this.requiresNewEntity = Boolean(this.getParam(params, 'requiresNewEntity', false));
		if (!params.display) {
			throw new RequiredPropertyError({
				parent: this,
				key: 'display',
			});
		}

		this.display = {};
		this.display.name = this.getParam(params.display, 'name');
		this.display.description = this.getParam(params.display, 'description');
		this.display.category = this.getParam(params.display, 'category');
		this.display.detailsUrl = this.getParam(params.display, 'detailsUrl');
		this.display.icon = this.getParam(params.display, 'icon');
		this.keys = this.getParam(params, 'keys', []);
	}

	get() {
		return {
			type: this.module.getName(),

			// list of entities the module can connect to
			integrations: this.integrations.map((val) => val.getName()),

			// list of special data required to make an entity i.e. a shop id. This information should be sent back
			keys: this.keys,

			// Flag for if the User can configure any settings
			hasUserConfig: this.hasUserConfig,

			// if this integration can be used multiple times with the same integration pair. For example I want to
			// connect two different Etsy shops to the same Freshbooks account.
			isMany: this.isMany,

			// if this is true it means we need to create a new entity for every integration pair and not use an
			// existing one. This would be true for scenarios where the client wishes to have individual control over
			// the integerations it has connected to its app. They would want this to let their users only delete
			// single integrations without notifying our server.
			requiresNewEntity: this.requiresNewEntity,

			// this is information required for the display side of things on the front end
			display: this.display,

			// this is information for post-authentication config, using jsonSchema and uiSchema for display on the frontend
			// Maybe include but probably not, I like making someone make a follow-on request
			// configOptions: this.configOptions,
		};
	}
}

module.exports = Options;
