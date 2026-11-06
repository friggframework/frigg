class UpdateAuthenticationStatus {
    constructor({ credentialRepository }) {
        this.credentialRepository = credentialRepository;
    }

    /**
     * @param {string} credentialId
     * @param {boolean} authIsValid
     */
    async execute(credentialId, authIsValid) {
        await this.credentialRepository.updateAuthenticationStatus(credentialId, authIsValid);
    }
}

module.exports = { UpdateAuthenticationStatus };