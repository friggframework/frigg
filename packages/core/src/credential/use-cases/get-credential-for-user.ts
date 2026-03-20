import type { CredentialRepositoryInterface, CredentialData } from '../repositories/credential-repository-interface';

interface GetCredentialForUserDeps {
    credentialRepository: CredentialRepositoryInterface;
}

export class GetCredentialForUser {
    private readonly credentialRepository: CredentialRepositoryInterface;

    constructor({ credentialRepository }: GetCredentialForUserDeps) {
        this.credentialRepository = credentialRepository;
    }

    async execute(credentialId: string, userId: string): Promise<CredentialData> {
        const credential = await this.credentialRepository.findCredentialById(credentialId);

        if (!credential) {
            throw new Error(`Credential with id ${credentialId} not found`);
        }

        if (credential.userId!.toString() !== userId.toString()) {
            throw new Error(`Credential ${credentialId} does not belong to user ${userId}`);
        }

        return credential;
    }
}
