const { User } = require('./user');

class UserFactory {
    constructor(options = {}) {
        this.options = options;
    }

    create() {
        return new User(this.options);
    }
}

module.exports = { UserFactory }; 