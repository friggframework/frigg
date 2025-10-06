class GetCredentialForUser {
    constructor({ credentialRepository }) {
        this.credentialRepository = credentialRepository;
    }

    async execute(credentialId, userId) {
        const credential = await this.credentialRepository.findCredentialById(credentialId);

        if (!credential) {
            throw new Error(`Credential with id ${credentialId} not found`);
        }

        if (credential.user.toString() !== userId.toString()) {
            throw new Error(`Credential ${credentialId} does not belong to user ${userId}`);
        }

        return credential;
    }
}

module.exports = { GetCredentialForUser };
