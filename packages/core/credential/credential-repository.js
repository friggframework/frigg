const { Credential } = require('../module-plugin');

class CredentialRepository {
    async findCredentialById(id) {
        return Credential.findById(id);
    }
}

module.exports = { CredentialRepository };
