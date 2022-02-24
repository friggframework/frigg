const Delegate = require("../Delegate");

class IntegrationConfigManager extends Delegate {
  constructor(params) {
    super(params);
    this.primary = null;
    this.options = [];
  }

  async getIntegrationOptions() {
    return {
      entities: {
        primary: this.primary.getName(),
        options: this.options.map((val) => val.get()),
        authorized: [],
      },
      integrations: [],
    };
  }
}

module.exports = IntegrationConfigManager;
