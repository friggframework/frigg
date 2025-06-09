const { User } = require('./user');

class UserFactory {
    /**
     * Creates a new UserFactory instance.
     * @param {Object} [userDefinition={}] - The user property from the app definition containing user configuration options, eg. appDefinition.user
     */
    constructor(userDefinition = {}) {
        this.userDefinition = userDefinition;
    }

    create() {
        return new User(this.userDefinition);
    }
}

module.exports = { UserFactory }; 